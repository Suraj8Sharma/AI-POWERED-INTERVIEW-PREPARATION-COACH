import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEndpointEmbeddings


@dataclass(frozen=True)
class RetrievedQuestion:
    question_text: str
    question_id: Optional[str]
    role_tag: Optional[str]
    difficulty_level: Optional[str]
    subtopic: Optional[str]
    ideal_answer: Optional[str]
    metadata: dict[str, Any]


def _clean_question_text(text: str) -> str:
    # CSVLoader stores rows like:
    # "question_text: <actual question>\nsource_ref: ..."
    if not text:
        return text
    lower = text.lower()
    prefix = "question_text:"
    if lower.startswith(prefix):
        # Keep everything after "question_text:" up to newline
        rest = text[len(prefix) :].lstrip()
        return rest.splitlines()[0].strip() if rest else text.strip()
    return text.strip()


def _get_embeddings() -> HuggingFaceEndpointEmbeddings:
    load_dotenv()
    token = os.getenv("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN not found. Add it to your .ENV/.env file.")

    # Uses Hugging Face Inference API (no local download).
    return HuggingFaceEndpointEmbeddings(
        model="sentence-transformers/all-MiniLM-L6-v2",
        huggingfacehub_api_token=token,
    )


def load_vectordb(persist_dir: str | Path) -> Chroma:
    persist_dir = Path(persist_dir)
    if not persist_dir.exists():
        raise FileNotFoundError(
            f"Chroma persist directory not found: {persist_dir}. "
            f"Run AI_BACKEND/rag_backend.ipynb to create it first."
        )

    embeddings = _get_embeddings()

    # IMPORTANT: For retrieval, we must pass the same embedding function.
    return Chroma(persist_directory=str(persist_dir), embedding_function=embeddings)


def list_roles(vectordb: Chroma) -> list[str]:
    """
    Returns unique `role_tag` values present in the vector DB metadata.
    """
    try:
        data = vectordb.get(include=["metadatas"])
    except Exception:
        # Fallback: access underlying chroma collection if wrapper doesn't expose get()
        data = vectordb._collection.get(include=["metadatas"])  # type: ignore[attr-defined]

    roles: set[str] = set()
    for md in data.get("metadatas", []) or []:
        if md and md.get("role_tag"):
            roles.add(str(md["role_tag"]).strip())

    return sorted(roles)


def fetch_questions_for_role_exact(
    vectordb: Chroma,
    role_tag: str,
    limit: int = 50,
) -> list[RetrievedQuestion]:
    """
    Fetches questions ONLY for the selected role using metadata filtering (no seed query).
    This is the correct "interview flow" retrieval.
    """
    where = {"role_tag": role_tag}

    try:
        data = vectordb.get(where=where, include=["documents", "metadatas"])
    except TypeError:
        # Some versions may not accept where/include on wrapper; fallback to underlying collection
        data = vectordb._collection.get(where=where, include=["documents", "metadatas"])  # type: ignore[attr-defined]
    except Exception:
        data = vectordb._collection.get(where=where, include=["documents", "metadatas"])  # type: ignore[attr-defined]

    docs = data.get("documents", []) or []
    metadatas = data.get("metadatas", []) or []

    out: list[RetrievedQuestion] = []
    for doc, md in zip(docs, metadatas):
        md = dict(md or {})
        out.append(
            RetrievedQuestion(
                question_text=_clean_question_text(doc or ""),
                question_id=md.get("question_id"),
                role_tag=md.get("role_tag"),
                difficulty_level=md.get("difficulty_level"),
                subtopic=md.get("subtopic"),
                ideal_answer=md.get("ideal_answer"),
                metadata=md,
            )
        )

    # Make it stable: sort by question_id if available
    out.sort(key=lambda q: (q.question_id or "", q.question_text))
    return out[:limit]


def fetch_questions_for_role(
    vectordb: Chroma,
    role_tag: str,
    k: int = 5,
    seed_query: str = "technical interview question",
) -> list[RetrievedQuestion]:
    """
    Returns top-k questions for a given role using semantic search with a metadata filter.
    """
    docs = vectordb.similarity_search(seed_query, k=k, filter={"role_tag": role_tag})

    out: list[RetrievedQuestion] = []
    for d in docs:
        md = dict(d.metadata or {})
        out.append(
            RetrievedQuestion(
                question_text=_clean_question_text(d.page_content),
                question_id=md.get("question_id"),
                role_tag=md.get("role_tag"),
                difficulty_level=md.get("difficulty_level"),
                subtopic=md.get("subtopic"),
                ideal_answer=md.get("ideal_answer"),
                metadata=md,
            )
        )
    return out


def _is_behavioural(difficulty_level: Any) -> bool:
    if difficulty_level is None:
        return False
    text = str(difficulty_level).strip().lower()
    # Dataset uses "Behavioural" (sometimes with trailing space)
    return "behavioural" in text or "behavioral" in text

def _is_coding(q: RetrievedQuestion) -> bool:
    """Identify coding questions based on common LeetCode phrasing or subtopic."""
    text = (q.question_text or "").lower()
    topic = (q.subtopic or "").lower()
    
    coding_topics = [
        "arrays & hashing", "two pointers", "linked lists", "stacks", 
        "dynamic programming", "binary search", "trees"
    ]
    if any(ct in topic for ct in coding_topics):
        return True
        
    phrases = ["write a function", "given an array", "singly linked list", "given the root", "linked list", "integer array", "return an array"]
    return any(p in text for p in phrases)


def fetch_questions_for_role_random_mix(
    vectordb: Chroma,
    role_tag: str,
    technical_min: int = 6,
    technical_max: int = 7,
    behavioural_count: int = 3,
    seed: int | None = None,
    limit: int = 2000,
) -> list[RetrievedQuestion]:
    """
    Fetch a random interview set for a role using metadata-only filtering:
    - technical questions: difficulty_level in {Easy, Medium, Hard, ...} (i.e., not Behavioural)
    - behavioural questions: difficulty_level contains "Behavioural"
    """
    rng = random.Random(seed)

    where = {"role_tag": role_tag}
    try:
        # Explicitly pass limit to prevent ChromaDB from returning only default subset
        data = vectordb.get(where=where, include=["documents", "metadatas"], limit=limit)
    except TypeError:
        try:
            data = vectordb._collection.get(where=where, include=["documents", "metadatas"], limit=limit)  # type: ignore[attr-defined]
        except Exception:
            data = vectordb._collection.get(where=where, include=["documents", "metadatas"])
    except Exception:
        data = vectordb._collection.get(where=where, include=["documents", "metadatas"])  # type: ignore[attr-defined]

    docs = data.get("documents", []) or []
    metadatas = data.get("metadatas", []) or []

    all_qs: list[RetrievedQuestion] = []
    for doc, md in zip(docs, metadatas):
        md = dict(md or {})
        all_qs.append(
            RetrievedQuestion(
                question_text=_clean_question_text(doc or ""),
                question_id=md.get("question_id"),
                role_tag=md.get("role_tag"),
                difficulty_level=md.get("difficulty_level"),
                subtopic=md.get("subtopic"),
                ideal_answer=md.get("ideal_answer"),
                metadata=md,
            )
        )

    if limit is not None:
        all_qs = all_qs[:limit]

    behavioural = [q for q in all_qs if _is_behavioural(q.difficulty_level)]
    tech_all = [q for q in all_qs if not _is_behavioural(q.difficulty_level)]
    
    # Separate coding from standard conceptual tech questions
    coding = [q for q in tech_all if _is_coding(q)]
    standard_tech = [q for q in tech_all if not _is_coding(q)]
    
    print(f"\n[DEBUG] Found {len(coding)} coding questions for role: {role_tag}")

    n_behavioural = min(behavioural_count, len(behavioural))
    n_coding = 2 # Force exactly 2 coding questions
    
    # Fill the rest of the quota with standard technical questions
    n_standard_tech = rng.randint(technical_min, technical_max) - n_coding
    n_standard_tech = max(0, min(n_standard_tech, len(standard_tech)))

    chosen_behavioural = rng.sample(behavioural, n_behavioural) if n_behavioural > 0 else []
    chosen_standard_tech = rng.sample(standard_tech, n_standard_tech) if n_standard_tech > 0 else []
    
    # If vectordb.get() truncated the results and missed the newly added coding 
    # questions at the end of the DB, we explicitly search for them.
    if len(coding) < n_coding:
        print(f"[DEBUG] Found only {len(coding)} coding questions from get(). Forcing semantic search...")
        try:
            extra_docs = vectordb.similarity_search(
                "Write a function to solve given an array string integer leetcode",
                k=20,
                filter={"role_tag": role_tag}
            )
            for d in extra_docs:
                md = dict(d.metadata or {})
                q_ext = RetrievedQuestion(
                    question_text=_clean_question_text(d.page_content),
                    question_id=md.get("question_id"),
                    role_tag=md.get("role_tag"),
                    difficulty_level=md.get("difficulty_level"),
                    subtopic=md.get("subtopic"),
                    ideal_answer=md.get("ideal_answer"),
                    metadata=md,
                )
                if _is_coding(q_ext) and not any(c.question_text == q_ext.question_text for c in coding):
                    coding.append(q_ext)
        except Exception as e:
            print(f"[DEBUG] Semantic search fallback failed: {e}")

    if len(coding) >= n_coding:
        chosen_coding = rng.sample(coding, n_coding)
    else:
        chosen_coding = list(coding)
        needed = n_coding - len(chosen_coding)
        if needed > 0:
            print(f"[DEBUG] Found only {len(coding)} coding questions in DB. Injecting {needed} fallback(s).")
            fallbacks = [
                RetrievedQuestion(
                    question_text="Write a function to solve the 'Two Sum' problem. Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
                    question_id="fallback_code_1",
                    role_tag=role_tag,
                    difficulty_level="Medium",
                    subtopic="Arrays & Hashing",
                    ideal_answer="The optimal solution uses a Hash Map (dictionary) to store the complement of each number as we iterate through the array. This gives O(n) Time Complexity and O(n) Space Complexity. A brute force nested loop would be O(n^2) which is suboptimal.",
                    metadata={}
                ),
                RetrievedQuestion(
                    question_text="Write a function to check if a given string is a valid palindrome. It should ignore non-alphanumeric characters and be case-insensitive.",
                    question_id="fallback_code_2",
                    role_tag=role_tag,
                    difficulty_level="Easy",
                    subtopic="Two Pointers",
                    ideal_answer="The optimal solution uses the Two Pointer technique. One pointer starts at the beginning, one at the end, moving inward and skipping non-alphanumeric characters. This gives O(n) Time Complexity and O(1) Space Complexity.",
                    metadata={}
                )
            ]
            # Prevent duplicate injection if db already matched one of these
            existing_texts = {c.question_text.lower() for c in chosen_coding if c.question_text}
            for fb in fallbacks:
                if fb.question_text.lower() not in existing_texts:
                    chosen_coding.append(fb)
                if len(chosen_coding) == n_coding:
                    break

    # Return the questions in the exact requested order: 
    # Standard Technical -> Coding -> Behavioural
    return chosen_standard_tech + chosen_coding + chosen_behavioural
