"""
Tax Engine — Individual Income Tax calculation.

Three modes:
  1. normal: Cumulative withholding method (七级累进, 3%-45%)
  2. service: Lump-sum 20% on (wage - 800)
  3. non_taxable: Zero tax (HK employees, etc.)
"""
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.all_models import TaxBracket, SalaryRecord, Employee
from app.utils.rounding import round_half_up


async def find_tax_bracket(db: AsyncSession, taxable_income: Decimal) -> TaxBracket:
    """Find the applicable tax bracket for a given cumulative taxable income."""
    result = await db.execute(
        select(TaxBracket).where(
            and_(
                TaxBracket.min_income < taxable_income,
                TaxBracket.max_income >= taxable_income,
            )
        )
    )
    bracket = result.scalar_one_or_none()
    if bracket is None:
        # Fallback: get the highest bracket
        result = await db.execute(
            select(TaxBracket).order_by(TaxBracket.level.desc()).limit(1)
        )
        bracket = result.scalar_one()
    return bracket


async def get_cumulative_tax_data(
    db: AsyncSession, employee_id: int, period: str
) -> dict:
    """
    Get cumulative tax data from previous months in the same year.
    Returns previous cumulative taxable income and tax paid.
    """
    year = period[:4]  # '2026' from '2026-08'
    current_month = int(period[5:7])

    # Get all previous months' records for this employee in this year
    result = await db.execute(
        select(SalaryRecord).where(
            and_(
                SalaryRecord.employee_id == employee_id,
                SalaryRecord.period < period,
                SalaryRecord.period >= f"{year}-01",
            )
        ).order_by(SalaryRecord.period.desc())
    )
    records = result.scalars().all()

    if not records:
        return {
            "prev_cumul_taxable_income": Decimal("0"),
            "prev_cumul_tax_paid": Decimal("0"),
            "prev_month": 0,
        }

    # Use the most recent previous month's cumulative values
    latest = records[0]
    return {
        "prev_cumul_taxable_income": latest.cumul_taxable_income or Decimal("0"),
        "prev_cumul_tax_paid": latest.cumul_tax_paid or Decimal("0"),
        "prev_month": len(records),
    }


async def calc_income_tax_normal(
    db: AsyncSession,
    employee: Employee,
    month_number: int,
    wage_subtotal: Decimal,
    personal_welfare_total: Decimal,
    special_deductions_total: Decimal,
    period: str,
) -> dict:
    """
    Calculate monthly income tax using the cumulative withholding method (累计预扣法).

    Steps:
      1. 当月应税 = 薪资小计 - 个人福利合计 - 专项附加扣除
      2. 累计收入 = previous cumulative + 当月应税
      3. 减除费用 = 5000 × month_number
      4. 累计应纳税所得额 = max(累计收入 - 减除费用, 0)
      5. 查七级税率表 → 累计应纳税额
      6. 当月个税 = 累计应纳税额 - 已缴税额
    """
    # Step 1: Current month taxable income
    cur_month_taxable = wage_subtotal - personal_welfare_total - special_deductions_total

    # Step 2: Get previous cumulative data
    cumul_data = await get_cumulative_tax_data(db, employee.id, period)

    # Step 3: Cumulative income
    cumul_income = cumul_data["prev_cumul_taxable_income"] + cur_month_taxable

    # Step 4: Basic exemption (5000/month)
    EXEMPT_PER_MONTH = Decimal("5000")
    exempt_total = EXEMPT_PER_MONTH * month_number

    # Step 5: Taxable income = cumulative income - exemptions
    taxable_income = max(cumul_income - exempt_total, Decimal("0"))

    # Step 6: Find tax bracket and calculate cumulative tax
    bracket = await find_tax_bracket(db, taxable_income)
    cumul_tax = taxable_income * bracket.rate - bracket.quick_deduction

    # Step 7: Monthly tax = cumulative tax - previously paid
    prev_tax_paid = cumul_data["prev_cumul_tax_paid"]
    monthly_tax = round_half_up(max(cumul_tax - prev_tax_paid, Decimal("0")), 2)

    return {
        "cumul_income": cumul_income,
        "taxable_income": taxable_income,
        "cumul_tax": cumul_tax,
        "monthly_tax": monthly_tax,
        "tax_bracket_level": bracket.level,
    }


def calc_income_tax_service(wage_subtotal: Decimal) -> Decimal:
    """
    Service tax (劳务报酬): (薪资小计 - 800) × 20%, minimum 0.
    """
    if wage_subtotal <= Decimal("800"):
        return Decimal("0")
    return round_half_up((wage_subtotal - Decimal("800")) * Decimal("0.20"), 2)


def calc_income_tax_non_taxable() -> Decimal:
    """Non-taxable (HK employees): always 0."""
    return Decimal("0")
