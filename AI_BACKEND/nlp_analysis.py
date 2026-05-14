import re
from typing import Any, Dict, List

# A list of common English filler words. This can be expanded.
FILLER_WORDS = {
    "uh", "um", "er", "ah", "like", "so", "you know", "i mean", "right",
    "okay", "well", "basically", "actually", "literally", "totally",
    "sort of", "kind of"
}

def analyze_communication(answer: str, duration_seconds: float) -> Dict[str, Any]:
    """
    Analyzes the user's spoken answer for communication quality.

    Args:
        answer: The transcribed text of the user's answer.
        duration_seconds: The duration of the user's answer in seconds.

    Returns:
        A dictionary containing communication analysis metrics:
        - filler_words (List[str]): A list of detected filler words.
        - filler_count (int): The total count of filler words.
        - wpm (int): The speaking pace in words per minute.
        - communication_score (int): A score from 0-100 for communication quality.
        - comm_details (str): A short summary of the communication feedback.
    """
    if not answer or not answer.strip():
        return {
            "filler_words": [],
            "filler_count": 0,
            "wpm": 0,
            "communication_score": 0,
            "comm_details": "No answer was provided.",
        }

    # 1. Word Count and WPM
    words = re.findall(r'\b\w+\b', answer.lower())
    word_count = len(words)
    minutes = max(1.0, duration_seconds) / 60.0
    wpm = round(word_count / minutes) if minutes > 0 else 0

    # 2. Filler Word Detection
    filler_count = 0
    found_fillers = []
    for filler in FILLER_WORDS:
        # Use regex to find whole words/phrases
        matches = re.findall(r'\b' + re.escape(filler) + r'\b', answer.lower())
        if matches:
            count = len(matches)
            filler_count += count
            found_fillers.extend(matches)

    # 3. Scoring and Feedback
    # Score WPM: Ideal is 140-160.
    if 120 <= wpm <= 180:
        wpm_score = 100
    elif 100 <= wpm < 120 or 180 < wpm <= 200:
        wpm_score = 75
    else:
        wpm_score = 50

    # Score filler words: fewer is better.
    filler_ratio = filler_count / max(1, word_count)
    if filler_ratio < 0.02:  # Less than 2%
        filler_score = 100
    elif filler_ratio < 0.05: # Less than 5%
        filler_score = 75
    else:
        filler_score = 50

    # Combine scores (70% WPM, 30% Fillers)
    communication_score = round(0.7 * wpm_score + 0.3 * filler_score)

    # Generate feedback details
    if wpm < 120:
        pace_feedback = f"Your pace of {wpm} WPM is a bit slow. Try to speak more fluently."
    elif wpm > 180:
        pace_feedback = f"Your pace of {wpm} WPM is a bit fast. Try to speak more deliberately."
    else:
        pace_feedback = f"Your pace of {wpm} WPM is great."

    if filler_count > 0:
        filler_feedback = f"You used {filler_count} filler words, such as '{found_fillers[0]}'."
    else:
        filler_feedback = "You avoided using filler words, which is excellent."

    comm_details = f"{pace_feedback} {filler_feedback}"

    return {
        "filler_words": found_fillers,
        "filler_count": filler_count,
        "wpm": wpm,
        "communication_score": communication_score,
        "comm_details": comm_details,
    }