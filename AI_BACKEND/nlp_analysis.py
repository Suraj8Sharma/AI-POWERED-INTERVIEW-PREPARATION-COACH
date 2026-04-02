"""
NLP Communication Analysis — filler-word detection, speaking-pace (WPM),
and fluency scoring.

Public API
----------
    analyze_communication(transcript, duration_seconds) -> dict

Returns a dict with:
    communication_score   : int   0-100
    filler_count          : int
    filler_rate           : float fillers per 100 words
    fillers_found         : list[str]
    wpm                   : float words per minute
    wpm_score             : int   0-100
    fluency_score         : int   0-100
    vocabulary_richness   : float unique_words / total_words
    avg_sentence_length   : float
    details               : str   human-readable summary
"""

from __future__ import annotations

import re
from typing import Any


# ── Filler word / phrase patterns ──────────────────────────────────────────
# Ordered longest-first so multi-word fillers are matched before their parts.
_FILLER_PHRASES: list[str] = [
    "you know what i mean",
    "you know",
    "sort of",
    "kind of",
    "i mean",
    "i guess",
    "at the end of the day",
]

_FILLER_WORDS: set[str] = {
    "um", "uh", "uhh", "umm", "hmm", "hm",
    "like",          # only standalone; "I like Python" handled by boundary
    "basically",
    "actually",
    "literally",
    "right",         # filler when sentence-final / standalone
    "so",            # sentence-initial filler
    "well",          # sentence-initial filler
    "okay",
}


def _count_fillers(text: str) -> tuple[int, list[str]]:
    """Return (total_filler_count, list_of_found_fillers)."""
    lower = text.lower()
    found: list[str] = []

    # 1) Multi-word phrases first (greedy, non-overlapping)
    for phrase in _FILLER_PHRASES:
        pat = re.compile(r"\b" + re.escape(phrase) + r"\b", re.IGNORECASE)
        matches = pat.findall(lower)
        if matches:
            found.extend([phrase] * len(matches))
            # Remove matched phrases so single-word pass doesn't double-count
            lower = pat.sub(" ", lower)

    # 2) Single filler words on word boundaries
    tokens = re.findall(r"[a-z']+", lower)
    for tok in tokens:
        if tok in _FILLER_WORDS:
            found.append(tok)

    return len(found), found


# ── Words-per-Minute ───────────────────────────────────────────────────────

def _wpm(word_count: int, duration_seconds: float) -> float:
    if duration_seconds <= 0:
        return 0.0
    return word_count / duration_seconds * 60.0


def _wpm_score(wpm: float) -> int:
    """Score 0-100.  Optimal band is 130-160 WPM for technical interviews."""
    if wpm <= 0:
        return 0
    # Inside optimal range → 100
    if 130 <= wpm <= 160:
        return 100
    # Slightly outside → linear ramp-down
    if wpm < 130:
        return max(0, int(100 - (130 - wpm) * 1.2))
    # Too fast
    return max(0, int(100 - (wpm - 160) * 1.5))


# ── Fluency ────────────────────────────────────────────────────────────────

def _sentences(text: str) -> list[str]:
    """Naive sentence splitter (good enough for interview transcripts)."""
    parts = re.split(r"[.!?]+", text)
    return [s.strip() for s in parts if s.strip()]


def _fluency_metrics(text: str, word_count: int) -> dict[str, Any]:
    tokens = re.findall(r"[a-zA-Z']+", text.lower())
    unique = set(tokens)
    richness = len(unique) / max(1, len(tokens))

    sents = _sentences(text)
    avg_sent_len = word_count / max(1, len(sents))

    # Clarity penalises very long or very short sentences
    if 8 <= avg_sent_len <= 22:
        clarity = 1.0
    elif avg_sent_len < 8:
        clarity = max(0.3, avg_sent_len / 8.0)
    else:
        clarity = max(0.3, 1.0 - (avg_sent_len - 22) / 40.0)

    # Composite fluency 0-100
    score = int(round(
        (0.40 * richness + 0.30 * clarity + 0.30 * min(1.0, len(sents) / 3.0)) * 100
    ))
    score = max(0, min(100, score))

    return {
        "vocabulary_richness": round(richness, 3),
        "avg_sentence_length": round(avg_sent_len, 1),
        "clarity": round(clarity, 3),
        "sentence_count": len(sents),
        "fluency_score": score,
    }


# ── Public API ─────────────────────────────────────────────────────────────

def analyze_communication(
    transcript: str,
    duration_seconds: float,
) -> dict[str, Any]:
    """
    Analyze a spoken answer transcript for communication quality.

    Parameters
    ----------
    transcript : str
        The text transcribed from speech.
    duration_seconds : float
        How long the candidate spoke (seconds).

    Returns
    -------
    dict  with keys listed in the module docstring.
    """
    transcript = (transcript or "").strip()
    if not transcript:
        return {
            "communication_score": 0,
            "filler_count": 0,
            "filler_rate": 0.0,
            "fillers_found": [],
            "wpm": 0.0,
            "wpm_score": 0,
            "fluency_score": 0,
            "vocabulary_richness": 0.0,
            "avg_sentence_length": 0.0,
            "details": "No speech detected.",
        }

    words = re.findall(r"\S+", transcript)
    word_count = len(words)

    # Fillers
    filler_count, fillers_found = _count_fillers(transcript)
    filler_rate = round(filler_count / max(1, word_count) * 100, 1)
    filler_penalty = min(40, int(filler_rate * 4))           # up to -40 pts

    # WPM
    speaking_wpm = round(_wpm(word_count, duration_seconds), 1)
    wpm_sc = _wpm_score(speaking_wpm)

    # Fluency
    fl = _fluency_metrics(transcript, word_count)

    # Composite communication score  (weights from PRD)
    raw = int(round(
        0.35 * (100 - filler_penalty)   # filler-word component
        + 0.35 * wpm_sc                 # pace component
        + 0.30 * fl["fluency_score"]    # fluency component
    ))
    communication_score = max(0, min(100, raw))

    # Human-readable summary
    parts: list[str] = []
    if filler_count:
        parts.append(f"{filler_count} filler(s) detected ({filler_rate}/100 words)")
    parts.append(f"Pace: {speaking_wpm} WPM")
    if speaking_wpm < 100:
        parts.append("(slow — try to speak more naturally)")
    elif speaking_wpm > 180:
        parts.append("(fast — slow down for clarity)")
    parts.append(f"Fluency: {fl['fluency_score']}/100")
    details = ". ".join(parts) + "."

    return {
        "communication_score": communication_score,
        "filler_count": filler_count,
        "filler_rate": filler_rate,
        "fillers_found": fillers_found,
        "wpm": speaking_wpm,
        "wpm_score": wpm_sc,
        "fluency_score": fl["fluency_score"],
        "vocabulary_richness": fl["vocabulary_richness"],
        "avg_sentence_length": fl["avg_sentence_length"],
        "details": details,
    }
