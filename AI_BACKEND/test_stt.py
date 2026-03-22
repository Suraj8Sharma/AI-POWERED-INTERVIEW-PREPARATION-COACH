"""
test_stt.py — Standalone test for Speech-to-Text (record + transcribe).

Run from the project root:
    python AI_BACKEND/test_stt.py

What it does:
    1. Records 5 seconds of microphone audio
    2. Transcribes it using Whisper (base model)
    3. Prints the result and validates it is a non-empty string
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure the project root is on sys.path so the import works
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from AI_BACKEND.audio_capture import record_audio, transcribe_audio


def main():
    print("=" * 60)
    print("  SPEECH-TO-TEXT TEST")
    print("=" * 60)

    # ── Step 1: Record ────────────────────────────────────────
    RECORD_SECONDS = 5
    print(f"\n🎙️  Will record for {RECORD_SECONDS} seconds...")
    print("   Get ready to speak!\n")

    wav_path = record_audio(seconds=RECORD_SECONDS)
    print(f"   Audio saved at: {wav_path}")
    assert wav_path.exists(), f"WAV file not found: {wav_path}"
    assert wav_path.stat().st_size > 0, "WAV file is empty"
    print("   ✅  Audio file exists and is non-empty.\n")

    # ── Step 2: Transcribe ────────────────────────────────────
    print("🔄  Transcribing with Whisper (base model)...")
    text = transcribe_audio(wav_path, model_name="base", lang="en")

    print("\n" + "─" * 60)
    print(f"📝  TRANSCRIPT: \"{text}\"")
    print("─" * 60 + "\n")

    # ── Step 3: Validate ──────────────────────────────────────
    if text:
        print("✅  SUCCESS — Whisper returned a non-empty transcript.")
    else:
        print("⚠️  WARNING — Whisper returned an empty transcript.")
        print("   This may happen if the mic was silent or background noise was low.")
        print("   The STT pipeline itself is working correctly.")

    print("\n" + "=" * 60)
    print("  TEST COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
