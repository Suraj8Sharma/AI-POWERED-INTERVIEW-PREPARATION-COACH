from __future__ import annotations

import argparse
import json
import shutil
import time
from datetime import datetime
from pathlib import Path
import os


def _ensure_dirs() -> tuple[Path, Path]:
    """
    Uses the same structure as your notebook:
    - AI_BACKEND/audio_capture/audio_inputs/
    """
    base_dir = Path(__file__).resolve().parent
    audio_dir = base_dir / "audio_inputs"
    transcripts_out = audio_dir / "transcripts.jsonl"

    audio_dir.mkdir(parents=True, exist_ok=True)
    return audio_dir, transcripts_out


def _record_wav(output_wav: Path, seconds: int = 7, samplerate: int = 16000) -> None:
    """
    Records microphone audio and saves to a mono 16kHz WAV file.
    Requires: sounddevice + scipy.
    """
    import numpy as np
    import sounddevice as sd
    from scipy.io.wavfile import write as wav_write

    print(f"\nRecording for {seconds} seconds... Speak now.")
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

    wav_write(str(output_wav), samplerate, audio_int16)
    print(f"Saved audio: {output_wav}\n")


def _transcribe_with_whisper(wav_path: Path, model_name: str = "base", lang: str = "en") -> str:
    """
    Uses OpenAI Whisper via `openai-whisper` package.
    Note: Whisper needs an `ffmpeg` binary installed and available in PATH.
    """
    # Whisper requires ffmpeg/ffprobe executables on PATH.
    # If the user didn't install system ffmpeg, we try using the ffmpeg binary
    # shipped by the `imageio-ffmpeg` package (it installs an executable).
    if shutil.which("ffmpeg") is None:
        try:
            from imageio_ffmpeg import get_ffmpeg_exe  # type: ignore

            ffmpeg_exe = Path(get_ffmpeg_exe())
            ffmpeg_dir = ffmpeg_exe.parent

            # Whisper calls the literal executable name: "ffmpeg".
            # imageio-ffmpeg ships a binary with a versioned name (e.g. ffmpeg-...exe),
            # so "ffmpeg" won't resolve via PATH. Create a lightweight alias cmd.
            alias_dir = audio_dir = wav_path.parent / "_ffmpeg_alias"
            alias_dir.mkdir(parents=True, exist_ok=True)

            alias_cmd = alias_dir / "ffmpeg.cmd"
            if not alias_cmd.exists():
                alias_cmd.write_text(
                    "@echo off\n"
                    f"\"{ffmpeg_exe}\" %*\n",
                    encoding="utf-8",
                )

            # Also copy/alias to the exact executable name Whisper expects: "ffmpeg".
            alias_exe = alias_dir / "ffmpeg.exe"
            if not alias_exe.exists():
                try:
                    import shutil as _shutil

                    _shutil.copy2(str(ffmpeg_exe), str(alias_exe))
                except Exception:
                    # If copy fails, cmd alias may still work for some setups.
                    pass

            os.environ["PATH"] = str(alias_dir) + os.pathsep + os.environ.get(
                "PATH", ""
            )
        except Exception:
            raise RuntimeError(
                "ffmpeg was not found in PATH. Whisper requires ffmpeg for audio decoding.\n"
                "Fix options:\n"
                "1) Install system ffmpeg and ensure `ffmpeg.exe` is in PATH, OR\n"
                "2) Install the Python helper: `pip install imageio-ffmpeg` and rerun this script."
            )

    try:
        import whisper  # type: ignore
    except ModuleNotFoundError as e:
        raise RuntimeError(
            "Whisper package not found. Install with: pip install openai-whisper"
        ) from e

    model = whisper.load_model(model_name)
    result = model.transcribe(str(wav_path), language=lang)
    return (result.get("text") or "").strip()


def _append_transcript(transcripts_out: Path, rec: dict) -> None:
    transcripts_out.parent.mkdir(parents=True, exist_ok=True)
    with open(transcripts_out, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Record mic audio and transcribe with Whisper.")
    parser.add_argument("--seconds", type=int, default=7, help="Recording duration (seconds).")
    parser.add_argument("--model", type=str, default="base", help="Whisper model size: tiny/base/small/medium/large")
    parser.add_argument("--lang", type=str, default="en", help="Language code for Whisper (e.g., en).")
    args = parser.parse_args()

    audio_dir, transcripts_out = _ensure_dirs()

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    wav_path = audio_dir / f"recording_{ts}.wav"

    _record_wav(wav_path, seconds=args.seconds)

    print("Transcribing with Whisper...")
    text = _transcribe_with_whisper(wav_path, model_name=args.model, lang=args.lang)
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
    _append_transcript(transcripts_out, rec)
    print(f"Transcript saved to: {transcripts_out}")


if __name__ == "__main__":
    main()

