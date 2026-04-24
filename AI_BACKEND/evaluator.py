import json
import re
from functools import lru_cache
from typing import Any

from dotenv import load_dotenv


def _safe_json_loads(text: str) -> dict[str, Any]:
    """
    Tries to parse JSON from an LLM response. Handles cases like:
    - JSON wrapped in ```json ... ```
    - extra text before/after JSON
    """
    if not text:
        return {}

    # Strip code fences
    text = re.sub(r"```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    text = re.sub(r"```", "", text.strip())

    # If the model returned pure JSON, this should work.
    try:
        return json.loads(text)
    except Exception:
        pass

    # Try to extract the first {...} JSON object.
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


@lru_cache(maxsize=1)
def _get_llm():
    """
    Creates the HF endpoint LLM once.
    If HF_TOKEN is missing or dependencies are not installed, we raise.
    """
    load_dotenv()
    token = None
    try:
        import os

        token = os.getenv("HF_TOKEN")
    except Exception:
        token = None

    if not token:
        raise RuntimeError("HF_TOKEN not found in environment (.ENV).")

    # Lazy imports so the evaluator can still work with fallback if needed.
    from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

    llm = HuggingFaceEndpoint(
        repo_id="meta-llama/Llama-3.1-8B-Instruct",
        # LangChain/HF endpoint typically supports text generation tasks.
        # If task arg is not needed in your version, you can remove it.
        task="text-generation",
        huggingfacehub_api_token=token,
    )
    return ChatHuggingFace(llm=llm)


def _heuristic_score(user_answer: str, ideal_answer: str) -> dict[str, Any]:
    """
    Simple fallback scoring when the LLM call fails.
    Uses token overlap between user and ideal answers.
    """
    user_answer = (user_answer or "").lower()
    ideal_answer = (ideal_answer or "").lower()

    # keep only alpha-numeric tokens
    user_tokens = set(re.findall(r"[a-z0-9]+", user_answer))
    ideal_tokens = set(re.findall(r"[a-z0-9]+", ideal_answer))

    if not ideal_tokens:
        return {
            "technical_score": 0,
            "strengths": [],
            "improvements": ["No ideal answer provided to compare."],
            "missing_points": [],
            "short_feedback": "Provide an answer and we will compare it to the ideal response.",
        }

    if not user_tokens:
        return {
            "technical_score": 0,
            "strengths": [],
            "improvements": ["Your answer is empty. Try explaining the key concepts from the ideal answer."],
            "missing_points": list(ideal_tokens)[:6],
            "short_feedback": "Please write a technical answer and try again.",
        }

    overlap = len(user_tokens & ideal_tokens)
    ratio = overlap / max(1, len(ideal_tokens))
    score = int(round(max(0.0, min(1.0, ratio)) * 100))

    strengths = []
    for t in sorted(user_tokens & ideal_tokens):
        if len(strengths) >= 3:
            break
        strengths.append(t)

    improvements = []
    if score < 60:
        improvements.append("Add missing key points from the ideal answer for better coverage.")
    else:
        improvements.append("Nice coverage; try to be more structured and complete.")

    missing = sorted(list(ideal_tokens - user_tokens))[:6]

    return {
        "technical_score": score,
        "strengths": strengths,
        "improvements": improvements,
        "missing_points": missing,
        "short_feedback": "Heuristic feedback computed from keyword overlap (fallback mode).",
    }


def evaluate_technical_answer(
    *,
    question_text: str,
    ideal_answer: str,
    user_answer: str,
    code_submission: str | None = None,
    role_tag: str | None = None,
    difficulty_level: str | None = None,
) -> dict[str, Any]:
    """
    Returns feedback as JSON-like dict:
      - technical_score (0-100)
      - strengths (list[str])
      - improvements (list[str])
      - missing_points (list[str])
      - short_feedback (str)

    Primary method: LLM scoring.
    Fallback: keyword overlap heuristic.
    """
    user_answer = user_answer or ""
    ideal_answer = ideal_answer or ""
    code_submission = code_submission or ""

    # LLM scoring (best effort)
    try:
        llm = _get_llm()

        role_hint = f"Role: {role_tag}.\n" if role_tag else ""
        diff_hint = f"Difficulty: {difficulty_level}.\n" if difficulty_level else ""

        is_coding = bool(code_submission.strip() and not code_submission.strip().startswith("# Write your optimal"))

        if is_coding:
            prompt = (
                "You are an expert technical interviewer evaluating a coding challenge.\n"
                f"{role_hint}{diff_hint}"
                f"Question:\n{question_text}\n\n"
                f"Ideal Reference:\n{ideal_answer}\n\n"
                f"Candidate's spoken explanation:\n{user_answer}\n\n"
                f"Candidate's submitted code:\n{code_submission}\n\n"
                "Evaluate BOTH the candidate's explanation and their code. Check for Big-O complexity (Time & Space), edge cases, and code cleanliness.\n"
                "Return ONLY valid JSON with the following keys:\n"
                "- technical_score: integer 0-100\n"
                "- strengths: array of up to 3 short strings (e.g. 'Optimal O(n) time', 'Good variable naming')\n"
                "- improvements: array of up to 3 short strings (e.g. 'Missed empty array edge case')\n"
                "- missing_points: array of short strings (can be empty)\n"
                "- short_feedback: one short paragraph summarizing their code quality and explanation.\n"
            )
        else:
            prompt = (
                "You are an expert technical interviewer.\n"
                f"{role_hint}{diff_hint}"
                "Compare the user's answer with the ideal answer and score technical proficiency.\n\n"
                f"Question:\n{question_text}\n\n"
                f"Ideal answer:\n{ideal_answer}\n\n"
                f"User answer:\n{user_answer}\n\n"
                "Return ONLY valid JSON with the following keys:\n"
                "- technical_score: integer 0-100\n"
                "- strengths: array of up to 3 short strings\n"
                "- improvements: array of up to 3 short strings\n"
                "- missing_points: array of short strings (can be empty)\n"
                "- short_feedback: one short sentence\n"
            )

        resp = llm.invoke(prompt)
        data = _safe_json_loads(getattr(resp, "content", "") or str(resp))
        if data and "technical_score" in data:
            # Normalize types
            try:
                data["technical_score"] = int(data["technical_score"])
            except Exception:
                data["technical_score"] = 0

            data.setdefault("strengths", [])
            data.setdefault("improvements", [])
            data.setdefault("missing_points", [])
            data.setdefault("short_feedback", "")
            return data
    except Exception:
        # Fall back if HF endpoint / dependencies fail.
        pass

    combined_answer = user_answer
    if code_submission:
        combined_answer += "\n\nCode:\n" + code_submission
    return _heuristic_score(user_answer=combined_answer, ideal_answer=ideal_answer)
