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
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np


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
# ffmpeg helper  (Whisper fallback only — PCM WAV loads without ffmpeg)
# ---------------------------------------------------------------------------

def _subprocess_kwargs() -> dict:
    kw: dict = {"capture_output": True, "timeout": 20}
    if sys.platform == "win32":
        kw["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return kw


def _ffmpeg_version_ok(executable: str) -> bool:
    try:
        r = subprocess.run([executable, "-version"], **_subprocess_kwargs())
        return r.returncode == 0
    except Exception:
        return False


def _ensure_ffmpeg_on_path() -> None:
    """
    Ensure a working ``ffmpeg`` is on PATH for Whisper's file-based loader.

    Verifies with ``ffmpeg -version`` — a broken shim on PATH (e.g. ``.cmd``
    pointing at another machine) is ignored and we fall through to
    ``imageio-ffmpeg``.
    """
    candidates: list[str] = []

    try:
        w = shutil.which("ffmpeg")
        if w:
            candidates.append(w)
    except Exception:
        pass

    try:
        import imageio_ffmpeg  # type: ignore

        pkg_dir = Path(imageio_ffmpeg.__file__).resolve().parent
        bin_dir = pkg_dir / "binaries"
        if bin_dir.is_dir():
            for f in sorted(bin_dir.iterdir()):
                if f.is_file() and f.name.startswith("ffmpeg"):
                    candidates.append(str(f))
                    break
        from imageio_ffmpeg import get_ffmpeg_exe  # type: ignore

        exe_iio = get_ffmpeg_exe()
        if exe_iio and exe_iio not in candidates:
            candidates.append(exe_iio)
    except ImportError:
        pass
    except Exception:
        pass

    seen: set[str] = set()
    for c in candidates:
        if not c or c in seen:
            continue
        seen.add(c)
        if _ffmpeg_version_ok(c):
            ffmpeg_dir = str(Path(c).resolve().parent)
            current_path = os.environ.get("PATH") or ""
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + current_path
            os.environ["IMAGEIO_FFMPEG_EXE"] = c
            print(f"[STT] ffmpeg resolved → {c}")
            return

    raise RuntimeError(
        "No working ffmpeg found. Whisper needs ffmpeg only for non-PCM audio.\n"
        "Fix options:\n"
        "1) Install ffmpeg and add it to PATH, OR\n"
        "2) pip install imageio-ffmpeg\n"
        "Tip: WAV files saved by this app are decoded in-process and do not need ffmpeg."
    )


def _load_wav_for_whisper(wav_path: Path) -> np.ndarray:
    """
    Decode a PCM ``.wav`` to float32 mono [-1, 1] at 16 kHz without ffmpeg
    (matches what ``record_audio`` writes).
    """
    from scipy import signal
    from scipy.io.wavfile import read as wav_read

    sr, data = wav_read(str(wav_path))
    if data.size == 0:
        raise ValueError("empty WAV")

    if data.ndim == 2:
        data = data.mean(axis=1)

    if data.dtype == np.uint8:
        audio = (data.astype(np.float32) - 128.0) / 128.0
    elif np.issubdtype(data.dtype, np.floating):
        audio = np.clip(data.astype(np.float32), -1.0, 1.0)
    else:
        ii = np.iinfo(data.dtype)
        scale = float(max(abs(ii.min), ii.max))
        audio = np.clip(data.astype(np.float32) / scale, -1.0, 1.0)

    if sr != 16000:
        n_new = max(1, int(round(len(audio) * 16000.0 / float(sr))))
        audio = signal.resample(audio.astype(np.float64), n_new).astype(np.float32)

    return np.ascontiguousarray(audio, dtype=np.float32)


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

    # float32 [-1, 1] -> int16  (1 channel: squeeze all length-1 dims)
    audio = np.squeeze(audio)
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

    audio_np: np.ndarray | None = None
    try:
        audio_np = _load_wav_for_whisper(wav_path)
        print(f"[STT] Loaded {wav_path.name} in-process (no ffmpeg). samples={len(audio_np)}")
    except Exception as exc:
        print(f"[STT] In-process WAV decode failed ({exc!r}); using Whisper+ffmpeg path.")

    if audio_np is not None:
        result = model.transcribe(audio_np, language=lang)
    else:
        _ensure_ffmpeg_on_path()
        print("[STT] ffmpeg check passed.")
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
