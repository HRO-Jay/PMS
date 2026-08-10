"""
Pydantic v2 schemas — Report request/response models.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class CompanySummaryItem(BaseModel):
    """One row in the company summary report."""
    company_code: str
    company_full_name: str
    region: str
    employee_count: int
    total_wages: Decimal
    total_personal_welfare: Decimal
    total_company_welfare: Decimal
    total_tax: Decimal
    total_net_pay: Decimal
    total_cost: Decimal


class CompanySummaryReport(BaseModel):
    """Company summary report for a given period."""
    period: str
    generated_at: datetime
    companies: list[CompanySummaryItem]
    grand_total_wages: Decimal
    grand_total_tax: Decimal
    grand_total_net_pay: Decimal
    grand_total_cost: Decimal
