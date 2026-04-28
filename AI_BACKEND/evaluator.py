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
                "You are a meticulous Senior Software Engineer evaluating a candidate's solution to a coding challenge.\n"
                "Your evaluation must be thorough, covering both the code's technical correctness and the candidate's explanation.\n"
                f"{role_hint}{diff_hint}"
                f"## Question:\n{question_text}\n\n"
                f"## Ideal Reference Solution (for your eyes only):\n{ideal_answer}\n\n"
                f"## Candidate's Spoken Explanation:\n{user_answer}\n\n"
                f"## Candidate's Submitted Code:\n```\n{code_submission}\n```\n\n"
                "## Evaluation Criteria:\n"
                "1.  **Correctness (50% weight):** Does the code solve the problem correctly? Does it handle all edge cases mentioned in the ideal answer or implied by the problem?\n"
                "2.  **Efficiency (20% weight):** Is the Big-O time and space complexity optimal? Compare it to the ideal solution.\n"
                "3.  **Code Quality (15% weight):** Is the code clean, readable, and well-structured? Are variable names meaningful?\n"
                "4.  **Explanation (15% weight):** Did the candidate clearly explain their approach, logic, and complexity? Does their explanation match the code?\n\n"
                "## Scoring Rubric:\n"
                "- **90-100:** Optimal, clean, and correct solution with a clear explanation.\n"
                "- **75-89:** Correct solution but may be slightly suboptimal or have minor code quality issues.\n"
                "- **50-74:** The solution works for the main case but fails on important edge cases or is inefficient.\n"
                "- **<50:** The solution is incorrect, incomplete, or demonstrates a fundamental misunderstanding.\n\n"
                "## Output Format:\n"
                "You MUST return a single, valid JSON object and nothing else. Do not add any text before or after the JSON.\n"
                "The JSON object must have the following keys:\n"
                "{\n"
                '  "technical_score": <integer from 0 to 100>,\n'
                '  "strengths": [<array of up to 3 specific, short strings on what was done well (e.g., "Achieved optimal O(N) time complexity")>],\n'
                '  "improvements": [<array of up to 3 specific, actionable improvements (e.g., "Code fails for an empty input array", "Explanation of space complexity was incorrect")>],\n'
                '  "missing_points": [<array of key aspects missed, such as specific edge cases or a more efficient approach>],\n'
                '  "short_feedback": "<A concise, one-paragraph summary of the evaluation. Start with a clear statement on the solution\'s quality. (e.g., \'The code is correct but can be optimized.\')>"\n'
                "}"
            )
        else:
            prompt = (
                "You are a strict but fair Senior Engineer conducting a technical interview.\n"
                "Your task is to evaluate the candidate's understanding of a core concept.\n"
                f"{role_hint}{diff_hint}"
                "Analyze the candidate's answer by comparing it to the provided ideal answer. Your evaluation must be critical and precise.\n\n"
                f"## Question:\n{question_text}\n\n"
                f"## Ideal Answer (Ground Truth):\n{ideal_answer}\n\n"
                f"## Candidate's Answer:\n{user_answer}\n\n"
                "## Evaluation Criteria:\n"
                "1.  **Accuracy & Completeness (70% weight):** Does the candidate cover all key points from the ideal answer? Are there any technical inaccuracies?\n"
                "2.  **Clarity & Conciseness (20% weight):** Is the explanation clear, well-structured, and to the point?\n"
                "3.  **Depth of Knowledge (10% weight):** Does the candidate show a deeper understanding beyond a superficial explanation? Do they use correct terminology?\n\n"
                "## Scoring Rubric:\n"
                "- **90-100:** Excellent. Comprehensive, accurate, and clearly articulated. Shows deep understanding.\n"
                "- **75-89:** Good. Covers most key points but may have minor omissions or lack some depth.\n"
                "- **50-74:** Average. Understands the concept partially but has significant gaps or inaccuracies.\n"
                "- **<50:** Poor. Major misunderstandings or a very superficial answer.\n\n"
                "## Output Format:\n"
                "You MUST return a single, valid JSON object and nothing else. Do not add any text before or after the JSON.\n"
                "The JSON object must have the following keys:\n"
                "{\n"
                '  "technical_score": <integer from 0 to 100>,\n'
                '  "strengths": [<array of up to 3 specific, short strings detailing what the candidate did well>],\n'
                '  "improvements": [<array of up to 3 specific, short, actionable strings for improvement>],\n'
                '  "missing_points": [<array of key concepts or terms from the ideal answer that the candidate missed>],\n'
                '  "short_feedback": "<A single, concise paragraph summarizing the evaluation. Start with a direct statement about the quality of the answer. (e.g., \'The answer is strong but lacks detail on X.\')>"\n'
                "}"
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
