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
        data = vectordb.get(where=where, include=["documents", "metadatas"])
    except TypeError:
        data = vectordb._collection.get(where=where, include=["documents", "metadatas"])  # type: ignore[attr-defined]
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
    technical = [q for q in all_qs if not _is_behavioural(q.difficulty_level)]

    n_technical = rng.randint(technical_min, technical_max)
    n_technical = min(n_technical, len(technical))
    n_behavioural = min(behavioural_count, len(behavioural))

    chosen_technical = rng.sample(technical, n_technical) if n_technical > 0 else []
    chosen_behavioural = rng.sample(behavioural, n_behavioural) if n_behavioural > 0 else []

    mixed = chosen_technical + chosen_behavioural
    rng.shuffle(mixed)
    return mixed

