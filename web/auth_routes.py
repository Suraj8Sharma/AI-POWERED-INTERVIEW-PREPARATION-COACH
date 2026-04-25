"""JWT + bcrypt auth API backed by MongoDB, with Supabase token support."""

from __future__ import annotations

import asyncio
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field

from web.mongo_db import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "preploom-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "10080"))


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(None, max_length=120)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


def _hash_password(p: str) -> str:
    return pwd_context.hash(p)


def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    to_encode = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def user_doc_to_public(doc: dict) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "email": doc["email"],
        "name": doc.get("name") or "",
    }


def get_supabase_settings() -> tuple[str, str]:
    url = (
        os.getenv("SUPABASE_URL")
        or os.getenv("SUPABASE_PROJECT_URL")
        or os.getenv("supabase_url")
        or ""
    ).strip()
    anon_key = (
        os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("supabase_anon_key")
        or ""
    ).strip()
    return url.rstrip("/"), anon_key


def _fetch_supabase_user(token: str) -> dict[str, Any] | None:
    base_url, anon_key = get_supabase_settings()
    if not base_url or not anon_key:
        return None

    req = Request(
        f"{base_url}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": anon_key,
        },
    )

    try:
        with urlopen(req, timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return None

    if not payload or not payload.get("id") or not payload.get("email"):
        return None

    meta = payload.get("user_metadata") or {}
    return {
        "id": payload["id"],
        "email": payload["email"],
        "name": meta.get("name") or meta.get("full_name") or "",
        "auth_provider": "supabase",
    }


async def get_supabase_user_from_token(token: str) -> dict[str, Any] | None:
    return await asyncio.to_thread(_fetch_supabase_user, token)


async def get_user_by_id(user_id: str) -> dict | None:
    db = get_db()
    if not ObjectId.is_valid(user_id):
        return None
    oid = ObjectId(user_id)
    doc = await db.users.find_one({"_id": oid})
    if not doc:
        return None
    return user_doc_to_public(doc)


@router.post("/register")
async def register(body: UserRegister):
    db = get_db()
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    doc = {
        "email": email,
        "password_hash": _hash_password(body.password),
        "name": (body.name or "").strip(),
        "created_at": datetime.now(timezone.utc),
    }
    try:
        result = await db.users.insert_one(doc)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not reach database: {e}",
        ) from e
    uid = str(result.inserted_id)
    token = create_access_token(uid, email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": uid, "email": email, "name": doc["name"]},
    }


@router.post("/login")
async def login(body: UserLogin):
    db = get_db()
    email = body.email.lower().strip()
    doc = await db.users.find_one({"email": email})
    if not doc or not _verify_password(body.password, doc.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    uid = str(doc["_id"])
    token = create_access_token(uid, email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_doc_to_public(doc),
    }


@router.get("/me")
async def me(creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)]):
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(creds.credentials)
        uid = payload.get("sub")
        if not uid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        user = await get_supabase_user_from_token(creds.credentials)
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user = await get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_optional_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict | None:
    if not creds:
        return None
    try:
        payload = decode_token(creds.credentials)
        uid = payload.get("sub")
        if not uid:
            return None
    except JWTError:
        return await get_supabase_user_from_token(creds.credentials)
    return await get_user_by_id(uid)
