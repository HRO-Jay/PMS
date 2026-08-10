"""
Database engine and session management using SQLAlchemy 2.0 async.
Uses lazy initialization to avoid errors when DATABASE_URL is unset at import time
(e.g., during testing without a .env file).
"""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


def _build_async_url(sync_url: str) -> str:
    """Convert postgresql:// to postgresql+asyncpg:// for async support."""
    if not sync_url:
        return ""
    if sync_url.startswith("postgresql+asyncpg://"):
        return sync_url
    if sync_url.startswith("postgresql://"):
        return sync_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return sync_url


# Lazy-initialized engine and session factory
_engine = None
_async_session_factory = None


def _get_engine():
    """Lazy-create the async engine on first use."""
    global _engine
    if _engine is None:
        db_url = _build_async_url(settings.DATABASE_URL)
        if not db_url:
            raise RuntimeError(
                "DATABASE_URL is not set. Please configure it in .env or set "
                "it as an environment variable before starting the application."
            )
        _engine = create_async_engine(
            db_url,
            echo=settings.DEBUG,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
        )
    return _engine


def _get_session_factory():
    """Lazy-create the async session factory on first use."""
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            _get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _async_session_factory


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency: yields an async database session."""
    session_factory = _get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
