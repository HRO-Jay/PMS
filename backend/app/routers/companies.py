"""
Companies API router.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.all_models import Company

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("/")
async def list_companies(
    region: str | None = None,
    is_active: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """List all companies, optionally filtered by region."""
    stmt = select(Company).order_by(Company.region, Company.code)
    if region:
        stmt = stmt.where(Company.region == region)
    if is_active is not None:
        stmt = stmt.where(Company.is_active == is_active)

    result = await db.execute(stmt)
    companies = result.scalars().all()

    return {
        "total": len(companies),
        "companies": [
            {
                "code": c.code,
                "full_name": c.full_name,
                "short_name": c.short_name,
                "region": c.region,
                "category": c.category,
                "social_policy": c.social_policy,
            }
            for c in companies
        ],
    }


@router.get("/{company_code}")
async def get_company(company_code: str, db: AsyncSession = Depends(get_db)):
    """Get a single company by its code."""
    result = await db.execute(
        select(Company).where(Company.code == company_code)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return {
        "code": company.code,
        "full_name": company.full_name,
        "short_name": company.short_name,
        "region": company.region,
        "category": company.category,
        "social_policy": company.social_policy,
        "finance_contact": company.finance_contact,
        "seal_person": company.seal_person,
        "is_active": company.is_active,
    }
