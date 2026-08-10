"""
Social Insurance Engine — Calculates personal (five insurances + housing fund)
and company-side social welfare contributions.

Handles different regional policies:
  - 上海标准 (ROUND)
  - 北京标准 (ROUNDUP)
  - 天津标准 (ROUND)
  - 深圳标准 (ROUND_1DEC for housing fund)
  - 南京标准 (ROUND)
  - 不计税 / 无社保 (all zeros)
"""
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.all_models import SocialPolicy, Employee
from app.utils.rounding import get_rounding_fn


# Fixed social base for disabled proxy employees (代收代付残疾人)
DISABLED_SOCIAL_BASE = Decimal("7460")


async def get_social_policy(
    db: AsyncSession, company_code: str, period: str
) -> SocialPolicy | None:
    """
    Get the social policy for a company effective for the given period.
    Finds the most recent policy with effective_date <= period month start.
    """
    period_start = f"{period}-01"
    result = await db.execute(
        select(SocialPolicy)
        .where(
            SocialPolicy.company_code == company_code,
            SocialPolicy.effective_date <= period_start,
            SocialPolicy.is_active == True,
        )
        .order_by(SocialPolicy.effective_date.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def get_effective_social_base(employee: Employee) -> tuple[Decimal, Decimal]:
    """
    Get the effective social insurance base and housing fund base for an employee.

    Special case: disabled proxy employees always use social_base = 7460.
    """
    if employee.social_status == "残疾人":
        social_base = DISABLED_SOCIAL_BASE
    else:
        social_base = employee.social_base or Decimal("0")

    housing_base = employee.housing_fund_base or social_base
    return social_base, housing_base


def calc_social_personal(
    policy: SocialPolicy,
    social_base: Decimal,
    housing_base: Decimal,
) -> dict:
    """
    Calculate personal (employee) social insurance contributions.
    Returns individual items and total. (F4-F8 in spreadsheet)

    F3 = total_personal = sum of F4-F8
    """
    if policy is None:
        return {
            "pension": Decimal("0"),
            "medical": Decimal("0"),
            "unemployment": Decimal("0"),
            "housing": Decimal("0"),
            "supp_housing": Decimal("0"),
            "total": Decimal("0"),
        }

    rounding_fn = get_rounding_fn(policy.rounding_method)

    pension_p = rounding_fn(social_base * (policy.pension_rate_p or Decimal("0")), 2)
    medical_p = rounding_fn(
        social_base * (policy.medical_rate_p or Decimal("0"))
        + (policy.medical_fixed_p or Decimal("0")),
        2,
    )
    unemp_p = rounding_fn(social_base * (policy.unemployment_rate_p or Decimal("0")), 2)
    housing_p = rounding_fn(housing_base * (policy.housing_fund_rate_p or Decimal("0")), 2)

    supp_rate = policy.supp_housing_rate_p or Decimal("0")
    supp_housing_p = (
        rounding_fn(housing_base * supp_rate, 2) if supp_rate > 0 else Decimal("0")
    )

    total_p = sum([pension_p, medical_p, unemp_p, housing_p, supp_housing_p])

    return {
        "pension": pension_p,
        "medical": medical_p,
        "unemployment": unemp_p,
        "housing": housing_p,
        "supp_housing": supp_housing_p,
        "total": total_p,
    }


def calc_social_company(
    policy: SocialPolicy,
    social_base: Decimal,
    housing_base: Decimal,
) -> dict:
    """
    Calculate company-side social insurance contributions.
    Returns individual items and total. (F18-F24 in spreadsheet)

    F17 = total_company = sum of F18-F24
    """
    if policy is None:
        return {
            "pension": Decimal("0"),
            "medical": Decimal("0"),
            "unemployment": Decimal("0"),
            "injury": Decimal("0"),
            "maternity": Decimal("0"),
            "housing": Decimal("0"),
            "total": Decimal("0"),
        }

    rounding_fn = get_rounding_fn(policy.rounding_method)

    pension_c = rounding_fn(social_base * (policy.pension_rate_c or Decimal("0")), 2)
    medical_c = rounding_fn(social_base * (policy.medical_rate_c or Decimal("0")), 2)
    unemp_c = rounding_fn(social_base * (policy.unemployment_rate_c or Decimal("0")), 2)
    injury_c = rounding_fn(social_base * (policy.injury_rate_c or Decimal("0")), 2)
    maternity_c = rounding_fn(social_base * (policy.maternity_rate_c or Decimal("0")), 2)
    housing_c = rounding_fn(housing_base * (policy.housing_fund_rate_c or Decimal("0")), 2)

    total_c = sum([pension_c, medical_c, unemp_c, injury_c, maternity_c, housing_c])

    return {
        "pension": pension_c,
        "medical": medical_c,
        "unemployment": unemp_c,
        "injury": injury_c,
        "maternity": maternity_c,
        "housing": housing_c,
        "total": total_c,
    }
