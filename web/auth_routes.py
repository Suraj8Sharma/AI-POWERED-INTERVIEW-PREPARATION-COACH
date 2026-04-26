"""
PrepLoom auth — Supabase-only backend.

All user identity is managed by Supabase Auth.
The legacy MongoDB path has been removed.

Endpoints:
  POST /api/auth/register  — sign up via Supabase
  POST /api/auth/login     — sign in via Supabase
  GET  /api/auth/me        — validate token and return user info
"""

from __future__ import annotations

import asyncio
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


# ── Supabase settings ──────────────────────────────────────────────────────

def get_supabase_settings() -> tuple[str, str]:
    url = (
        os.getenv("SUPABASE_URL")
        or os.getenv("SUPABASE_PROJECT_URL")
        or os.getenv("supabase_url")
        or ""
    ).strip().rstrip("/")
    anon_key = (
        os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("supabase_anon_key")
        or ""
    ).strip()
    return url, anon_key


def _require_supabase() -> tuple[str, str]:
    url, key = get_supabase_settings()
    if not url or not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.",
        )
    return url, key


# ── Supabase REST helpers (sync, run in thread) ────────────────────────────

def _supabase_post(path: str, payload: dict) -> dict:
    """POST to a Supabase Auth endpoint. Returns parsed JSON or raises HTTPException."""
    url, anon_key = get_supabase_settings()
    req = Request(
        f"{url}/auth/v1/{path}",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": anon_key,
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = {}
        try:
            body = json.loads(e.read().decode())
        except Exception:
            pass
        msg = body.get("error_description") or body.get("msg") or body.get("error") or str(e)
        raise HTTPException(status_code=e.code, detail=msg)
    except (URLError, TimeoutError) as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not reach Supabase: {e}",
        )


def _supabase_get_user(token: str) -> dict[str, Any] | None:
    """Validate a Supabase access token and return the user dict, or None."""
    url, anon_key = get_supabase_settings()
    if not url or not anon_key:
        return None
    req = Request(
        f"{url}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": anon_key,
        },
    )
    try:
        with urlopen(req, timeout=4) as resp:
            payload = json.loads(resp.read().decode())
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
    return await asyncio.to_thread(_supabase_get_user, token)


# ── Pydantic models ────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(None, max_length=120)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


# ── Auth endpoints ─────────────────────────────────────────────────────────

@router.post("/register")
async def register(body: UserRegister):
    """Create a new user via Supabase Auth."""
    _require_supabase()

    if not body.password.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must not be blank or whitespace only.",
        )

    payload: dict[str, Any] = {
        "email": body.email.lower().strip(),
        "password": body.password,
    }
    if body.name and body.name.strip():
        payload["data"] = {"name": body.name.strip()}

    result = await asyncio.to_thread(_supabase_post, "signup", payload)

    user = result.get("user") or {}
    session = result.get("session") or {}
    meta = (user.get("user_metadata") or {})

    return {
        "access_token": session.get("access_token", ""),
        "token_type": "bearer",
        "user": {
            "id": user.get("id", ""),
            "email": user.get("email", body.email),
            "name": meta.get("name") or meta.get("full_name") or (body.name or ""),
        },
        # Supabase requires email confirmation by default; let the client know
        "email_confirmation_required": not bool(session.get("access_token")),
    }


@router.post("/login")
async def login(body: UserLogin):
    """Sign in an existing user via Supabase Auth."""
    _require_supabase()

    payload = {
        "email": body.email.lower().strip(),
        "password": body.password,
    }

    result = await asyncio.to_thread(
        _supabase_post, "token?grant_type=password", payload
    )

    user = result.get("user") or {}
    meta = user.get("user_metadata") or {}

    return {
        "access_token": result.get("access_token", ""),
        "token_type": "bearer",
        "user": {
            "id": user.get("id", ""),
            "email": user.get("email", body.email),
            "name": meta.get("name") or meta.get("full_name") or "",
        },
    }


@router.get("/me")
async def me(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
):
    """Return the current user from their Supabase access token."""
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    user = await get_supabase_user_from_token(creds.credentials)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please sign in again.",
        )
    return user


# ── Dependency for optional auth (used by /api/start etc.) ────────────────

async def get_optional_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict | None:
    """Returns the Supabase user if a valid token is present, otherwise None."""
    if not creds:
        return None
    return await get_supabase_user_from_token(creds.credentials)