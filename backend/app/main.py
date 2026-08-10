"""
Payroll Management System — FastAPI Entry Point.
开弈集团多公司薪酬管理系统.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    auth, companies, employees, salary, social, attendance, reports,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown events."""
    # Startup
    print(f"🚀 {settings.APP_NAME} v{settings.APP_VERSION} starting...")
    print(f"   Environment: {settings.ENVIRONMENT}")
    print(f"   Debug: {settings.DEBUG}")
    yield
    # Shutdown
    print("👋 Application shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="开弈集团多公司薪酬管理系统 — 替代 16 张 Excel 工作表的全栈 Web 应用",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(employees.router)
app.include_router(salary.router)
app.include_router(social.router)
app.include_router(attendance.router)
app.include_router(reports.router)


@app.get("/")
async def root():
    """Health check."""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": settings.APP_VERSION}
