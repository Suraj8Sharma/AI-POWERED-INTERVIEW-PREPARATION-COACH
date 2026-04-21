"""Async MongoDB client for PrepLoom (users, future session persistence)."""

from __future__ import annotations

import os

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017")
        _client = AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=int(os.getenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "2000")),
            connectTimeoutMS=int(os.getenv("MONGODB_CONNECT_TIMEOUT_MS", "2000")),
        )
    return _client


def get_db() -> AsyncIOMotorDatabase:
    name = os.getenv("MONGODB_DB", "preploom")
    return get_client()[name]
