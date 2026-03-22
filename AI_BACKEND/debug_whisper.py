"""Quick standalone test to isolate the Whisper import error."""
import traceback

print("Attempting to import whisper...")
try:
    import whisper
    print("OK - whisper imported successfully")
except Exception:
    traceback.print_exc()
    print("\n--- END TRACEBACK ---")
    print("whisper import FAILED")
