"""
Speech-to-Text module: record microphone audio and transcribe with OpenAI Whisper.

Public API
----------
    record_audio(seconds, samplerate)  -> Path    # records mic, returns WAV path
    transcribe_audio(wav_path, ...)    -> str     # Whisper STT, returns text

Both functions are safe to call from Streamlit or any other Python code.
The CLI entrypoint (``python -m record_and_transcribe``) still works as before.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Directory helpers
# ---------------------------------------------------------------------------

def _default_audio_dir() -> Path:
    """AI_BACKEND/audio_capture/audio_inputs/"""
    base_dir = Path(__file__).resolve().parent
    audio_dir = base_dir / "audio_inputs"
    audio_dir.mkdir(parents=True, exist_ok=True)
    return audio_dir


def _transcripts_path() -> Path:
    return _default_audio_dir() / "transcripts.jsonl"


# ---------------------------------------------------------------------------
# ffmpeg helper  (needed by Whisper)
# ---------------------------------------------------------------------------

def _ensure_ffmpeg_on_path() -> None:
    """
    Make sure Whisper can find an ``ffmpeg`` executable.

    Strategy:
    1. If ``ffmpeg`` is already on PATH → done.
    2. Locate the binary bundled inside the ``imageio-ffmpeg`` package
       (scan the ``binaries/`` folder directly — more reliable than
       ``get_ffmpeg_exe()`` which can fail on some setups).
    3. Set ``IMAGEIO_FFMPEG_EXE`` and prepend the folder to ``PATH``.
    """
    # 1 — already available?
    try:
        if shutil.which("ffmpeg") is not None:
            return
    except Exception:
        pass  # PATH might be None on some Windows Streamlit setups

    # 2 — find the binary shipped by imageio-ffmpeg
    ffmpeg_path: str | None = None

    try:
        import imageio_ffmpeg  # type: ignore
        pkg_dir = Path(imageio_ffmpeg.__file__).resolve().parent
        bin_dir = pkg_dir / "binaries"
        if bin_dir.is_dir():
            # Look for any ffmpeg executable in the binaries folder
            for f in bin_dir.iterdir():
                if f.name.startswith("ffmpeg") and f.suffix == ".exe" and f.is_file():
                    ffmpeg_path = str(f)
                    break
    except ImportError:
        pass

    # 2b — fallback: try the official helper (may raise on broken installs)
    if ffmpeg_path is None:
        try:
            from imageio_ffmpeg import get_ffmpeg_exe  # type: ignore
            ffmpeg_path = get_ffmpeg_exe()
        except Exception:
            pass

    if ffmpeg_path is None:
        raise RuntimeError(
            "ffmpeg was not found in PATH. Whisper requires ffmpeg for audio decoding.\n"
            "Fix options:\n"
            "1) Install system ffmpeg and ensure `ffmpeg.exe` is in PATH, OR\n"
            "2) Install the Python helper:  pip install imageio-ffmpeg==0.5.1"
        )

    # 3 — make it discoverable
    ffmpeg_dir = str(Path(ffmpeg_path).parent)
    current_path = os.environ.get("PATH") or ""
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + current_path
    os.environ["IMAGEIO_FFMPEG_EXE"] = ffmpeg_path
    print(f"[STT] ffmpeg resolved → {ffmpeg_path}")


# ---------------------------------------------------------------------------
# PUBLIC: Record
# ---------------------------------------------------------------------------

def record_audio(
    seconds: int = 7,
    samplerate: int = 16_000,
    output_dir: Optional[Path] = None,
) -> Path:
    """
    Record microphone audio and save to a mono 16 kHz WAV file.

    Parameters
    ----------
    seconds : int
        Duration in seconds.
    samplerate : int
        Sample rate (default 16 000 Hz – ideal for Whisper).
    output_dir : Path, optional
        Directory to save the WAV file. Defaults to ``audio_inputs/``.

    Returns
    -------
    Path
        Absolute path to the saved WAV file.
    """
    import numpy as np
    import sounddevice as sd
    from scipy.io.wavfile import write as wav_write

    if output_dir is None:
        output_dir = _default_audio_dir()
    output_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    wav_path = output_dir / f"recording_{ts}.wav"

    print(f"\n🎙️  Recording for {seconds} seconds... Speak now.")
    audio = sd.rec(
        frames=seconds * samplerate,
        samplerate=samplerate,
        channels=1,
        dtype=np.float32,
    )
    sd.wait()

    # float32 [-1, 1] -> int16
    audio = np.squeeze(audio, axis=1)
    audio_int16 = (audio * 32767.0).astype("int16")

    wav_write(str(wav_path), samplerate, audio_int16)
    print(f"✅  Saved audio → {wav_path}\n")
    return wav_path


# ---------------------------------------------------------------------------
# PUBLIC: Transcribe
# ---------------------------------------------------------------------------

# Cache loaded Whisper models so we only pay the load cost once per process.
_WHISPER_CACHE: dict = {}

def transcribe_audio(
    wav_path: Path | str,
    model_name: str = "base",
    lang: str = "en",
) -> str:
    """
    Transcribe a WAV file using OpenAI Whisper.

    Parameters
    ----------
    wav_path : Path or str
        Path to the audio file.
    model_name : str
        Whisper model size: ``tiny``, ``base``, ``small``, ``medium``, ``large``.
    lang : str
        Language code (e.g. ``"en"``).

    Returns
    -------
    str
        The transcribed text (stripped, may be empty for silence).
    """
    wav_path = Path(wav_path)
    print(f"[STT] transcribe_audio called: {wav_path} (model={model_name}, lang={lang})")

    _ensure_ffmpeg_on_path()
    print("[STT] ffmpeg check passed.")

    try:
        import whisper  # type: ignore
    except ModuleNotFoundError as e:
        raise RuntimeError(
            "Whisper package not found. Install with: pip install openai-whisper"
        ) from e

    # Use cached model if available
    if model_name in _WHISPER_CACHE:
        model = _WHISPER_CACHE[model_name]
        print(f"[STT] Using cached Whisper model '{model_name}'.")
    else:
        print(f"[STT] Loading Whisper model '{model_name}' (first time, may take a moment)...")
        model = whisper.load_model(model_name)
        _WHISPER_CACHE[model_name] = model
        print(f"[STT] Whisper model '{model_name}' loaded and cached.")

    print(f"[STT] Transcribing {wav_path.name} ...")
    result = model.transcribe(str(wav_path), language=lang)
    text = (result.get("text") or "").strip()
    print(f"[STT] Transcription result: \"{text}\"")
    return text


# ---------------------------------------------------------------------------
# Transcript logging
# ---------------------------------------------------------------------------

def _append_transcript(transcripts_out: Path, rec: dict) -> None:
    transcripts_out.parent.mkdir(parents=True, exist_ok=True)
    with open(transcripts_out, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Record mic audio and transcribe with Whisper."
    )
    parser.add_argument("--seconds", type=int, default=7, help="Recording duration (seconds).")
    parser.add_argument("--model", type=str, default="base", help="Whisper model size.")
    parser.add_argument("--lang", type=str, default="en", help="Language code.")
    args = parser.parse_args()

    wav_path = record_audio(seconds=args.seconds)

    print("Transcribing with Whisper...")
    text = transcribe_audio(wav_path, model_name=args.model, lang=args.lang)
    print("\n--- TRANSCRIPT ---\n")
    print(text)
    print("\n-------------------\n")

    rec = {
        "ts": time.time(),
        "file": wav_path.name,
        "wav": wav_path.name,
        "language": args.lang,
        "model": args.model,
        "text": text,
    }
    _append_transcript(_transcripts_path(), rec)
    print(f"Transcript saved to: {_transcripts_path()}")


if __name__ == "__main__":
    main()
