"""
Reports API router — Company summaries and analytics.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.all_models import SalaryRecord, Employee, Company
from app.schemas.report import CompanySummaryReport, CompanySummaryItem
from datetime import datetime

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/company-summary/{period}", response_model=CompanySummaryReport)
async def get_company_summary(
    period: str, db: AsyncSession = Depends(get_db),
):
    """Generate a company-level summary report for a given period."""
    # Get all salary records for this period grouped by company
    stmt = (
        select(
            Employee.company_code,
            Company.full_name,
            Company.region,
            func.count(SalaryRecord.id).label("employee_count"),
            func.sum(SalaryRecord.wage_subtotal).label("total_wages"),
            func.sum(SalaryRecord.personal_welfare).label("total_personal_welfare"),
            func.sum(SalaryRecord.company_welfare).label("total_company_welfare"),
            func.sum(SalaryRecord.tax_amount).label("total_tax"),
            func.sum(SalaryRecord.net_pay).label("total_net_pay"),
            func.sum(SalaryRecord.total_cost).label("total_cost"),
        )
        .join(Employee, SalaryRecord.employee_id == Employee.id)
        .outerjoin(Company, Employee.company_code == Company.code)
        .where(SalaryRecord.period == period)
        .group_by(Employee.company_code, Company.full_name, Company.region)
        .order_by(Employee.company_code)
    )
    result = await db.execute(stmt)
    rows = result.all()

    companies = [
        CompanySummaryItem(
            company_code=row[0],
            company_full_name=row[1] or row[0],
            region=row[2] or "",
            employee_count=row[3],
            total_wages=row[4] or Decimal("0"),
            total_personal_welfare=row[5] or Decimal("0"),
            total_company_welfare=row[6] or Decimal("0"),
            total_tax=row[7] or Decimal("0"),
            total_net_pay=row[8] or Decimal("0"),
            total_cost=row[9] or Decimal("0"),
        )
        for row in rows
    ]

    grand_wages = sum((c.total_wages for c in companies), Decimal("0"))
    grand_tax = sum((c.total_tax for c in companies), Decimal("0"))
    grand_net = sum((c.total_net_pay for c in companies), Decimal("0"))
    grand_cost = sum((c.total_cost for c in companies), Decimal("0"))

    return CompanySummaryReport(
        period=period,
        generated_at=datetime.now(),
        companies=companies,
        grand_total_wages=grand_wages,
        grand_total_tax=grand_tax,
        grand_total_net_pay=grand_net,
        grand_total_cost=grand_cost,
    )
