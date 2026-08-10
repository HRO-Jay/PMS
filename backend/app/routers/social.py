"""
Social Insurance API router — Policy management and calculation.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.all_models import SocialPolicy, Employee, Company
from app.services.social_engine import (
    get_social_policy, get_effective_social_base,
    calc_social_personal, calc_social_company,
)

router = APIRouter(prefix="/api/social", tags=["social"])


@router.get("/policies")
async def list_social_policies(
    company_code: str | None = Query(None),
    is_active: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """List all social policies, optionally filtered by company."""
    stmt = select(SocialPolicy).order_by(
        SocialPolicy.company_code, SocialPolicy.effective_date.desc()
    )
    if company_code:
        stmt = stmt.where(SocialPolicy.company_code == company_code)
    if is_active is not None:
        stmt = stmt.where(SocialPolicy.is_active == is_active)

    result = await db.execute(stmt)
    policies = result.scalars().all()

    return {
        "total": len(policies),
        "policies": [
            {
                "id": p.id,
                "company_code": p.company_code,
                "effective_date": str(p.effective_date),
                "pension_rate_p": float(p.pension_rate_p) if p.pension_rate_p else None,
                "pension_rate_c": float(p.pension_rate_c) if p.pension_rate_c else None,
                "medical_rate_p": float(p.medical_rate_p) if p.medical_rate_p else None,
                "medical_rate_c": float(p.medical_rate_c) if p.medical_rate_c else None,
                "medical_fixed_p": float(p.medical_fixed_p) if p.medical_fixed_p else None,
                "unemployment_rate_p": float(p.unemployment_rate_p) if p.unemployment_rate_p else None,
                "unemployment_rate_c": float(p.unemployment_rate_c) if p.unemployment_rate_c else None,
                "injury_rate_c": float(p.injury_rate_c) if p.injury_rate_c else None,
                "maternity_rate_c": float(p.maternity_rate_c) if p.maternity_rate_c else None,
                "housing_fund_rate_p": float(p.housing_fund_rate_p) if p.housing_fund_rate_p else None,
                "housing_fund_rate_c": float(p.housing_fund_rate_c) if p.housing_fund_rate_c else None,
                "rounding_method": p.rounding_method,
            }
            for p in policies
        ],
    }


@router.get("/calculate/{employee_id}")
async def calculate_employee_social(
    employee_id: int,
    period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
):
    """Preview social insurance calculation for a specific employee and period."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    social_base, housing_base = get_effective_social_base(emp)
    policy = await get_social_policy(db, emp.company_code, period)

    personal = calc_social_personal(policy, social_base, housing_base)
    company = calc_social_company(policy, social_base, housing_base)

    return {
        "employee": {
            "id": emp.id,
            "name": emp.name,
            "employee_no": emp.employee_no,
            "company_code": emp.company_code,
            "social_status": emp.social_status,
        },
        "bases": {
            "social_base": float(social_base),
            "housing_fund_base": float(housing_base),
        },
        "personal": {k: float(v) for k, v in personal.items()},
        "company": {k: float(v) for k, v in company.items()},
    }
