"""
Pydantic v2 schemas — Salary record request/response models.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class SalaryRecordCreate(BaseModel):
    """Create a salary record with manual input fields."""
    employee_id: int
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="月份 YYYY-MM")
    month_number: int = Field(..., ge=1, le=12)
    base_salary: Decimal = Field(..., max_digits=12, decimal_places=2)
    allowance: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    insurance_comm: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    kpi_provision: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    office_comm: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    performance: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    apartment_comm: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    heat_allowance: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    other_allowance: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    security_bonus: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    cleaning_bonus: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    child_edu_deduct: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    mortgage_deduct: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    rent_deduct: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    elder_care_deduct: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)
    education_deduct: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)


class SalaryRecordUpdate(BaseModel):
    """Update a salary record's manual input fields."""
    base_salary: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    allowance: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    insurance_comm: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    kpi_provision: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    office_comm: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    performance: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    apartment_comm: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    heat_allowance: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    other_allowance: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    security_bonus: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    cleaning_bonus: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    child_edu_deduct: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    mortgage_deduct: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    rent_deduct: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    elder_care_deduct: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    education_deduct: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)


class SalaryRecordResponse(BaseModel):
    """Salary record API response."""
    id: int
    employee_id: int
    period: str
    month_number: int
    base_salary: Optional[Decimal] = None
    allowance: Optional[Decimal] = None
    attendance_adjust: Optional[Decimal] = None
    insurance_comm: Optional[Decimal] = None
    kpi_provision: Optional[Decimal] = None
    office_comm: Optional[Decimal] = None
    performance: Optional[Decimal] = None
    apartment_comm: Optional[Decimal] = None
    heat_allowance: Optional[Decimal] = None
    other_allowance: Optional[Decimal] = None
    security_bonus: Optional[Decimal] = None
    cleaning_bonus: Optional[Decimal] = None
    monthly_wage: Optional[Decimal] = None
    wage_subtotal: Optional[Decimal] = None
    personal_welfare: Optional[Decimal] = None
    company_welfare: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    net_pay: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    cumul_taxable_income: Optional[Decimal] = None
    cumul_tax_paid: Optional[Decimal] = None
    tax_bracket_level: Optional[int] = None
    child_edu_deduct: Optional[Decimal] = None
    mortgage_deduct: Optional[Decimal] = None
    rent_deduct: Optional[Decimal] = None
    elder_care_deduct: Optional[Decimal] = None
    education_deduct: Optional[Decimal] = None
    is_locked: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PayrollRunRequest(BaseModel):
    """Request to run a payroll cycle."""
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    employee_ids: Optional[list[int]] = None  # None = all active employees
    force_recalc: bool = False


class PayrollRunResponse(BaseModel):
    """Response from a payroll calculation run."""
    period: str
    total_employees: int
    success_count: int
    error_count: int
    errors: list[dict] = []
    total_wages: Optional[Decimal] = None
    total_tax: Optional[Decimal] = None
    total_net_pay: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
