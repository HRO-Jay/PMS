"""
Pydantic v2 schemas — Employee request/response models.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class EmployeeBase(BaseModel):
    """Base employee fields shared by create/update/response."""

    employee_no: str = Field(..., min_length=1, max_length=30, description="员工编号")
    name: str = Field(..., min_length=1, max_length=50, description="姓名")
    company_code: str = Field(..., max_length=30, description="所属公司编码")
    company_full_name: str = Field(..., max_length=200, description="公司全称（反范式化）")
    department: Optional[str] = Field(None, max_length=100)
    position: Optional[str] = Field(None, max_length=100)
    tax_type: str = Field("normal", pattern=r"^(normal|service|non_taxable)$", description="计税模式")
    social_status: str = Field("有社保", pattern=r"^(有社保|无社保|残疾人)$")
    social_base: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    housing_fund_base: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    bank_account: Optional[str] = Field(None, description="银行账号（明文输入，加密存储）")
    id_number: Optional[str] = Field(None, description="身份证号（明文输入，加密存储）")
    join_date: Optional[date] = None
    leave_date: Optional[date] = None


class EmployeeCreate(EmployeeBase):
    """Schema for creating a new employee."""
    pass


class EmployeeUpdate(BaseModel):
    """Schema for updating an employee — all fields optional."""
    employee_no: Optional[str] = Field(None, min_length=1, max_length=30)
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    company_code: Optional[str] = Field(None, max_length=30)
    company_full_name: Optional[str] = Field(None, max_length=200)
    department: Optional[str] = Field(None, max_length=100)
    position: Optional[str] = Field(None, max_length=100)
    tax_type: Optional[str] = Field(None, pattern=r"^(normal|service|non_taxable)$")
    social_status: Optional[str] = Field(None, pattern=r"^(有社保|无社保|残疾人)$")
    social_base: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    housing_fund_base: Optional[Decimal] = Field(None, max_digits=12, decimal_places=2)
    bank_account: Optional[str] = None
    id_number: Optional[str] = None
    join_date: Optional[date] = None
    leave_date: Optional[date] = None
    is_active: Optional[bool] = None


class EmployeeResponse(EmployeeBase):
    """Schema for employee API response."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
