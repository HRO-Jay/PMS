# migration_id: 001
# Initial payroll system schema — all core tables
# This migration is applied by supabase/db push or alembic upgrade head

"""Initial payroll schema

Revision ID: 001
Revises:
Create Date: 2026-08-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, BYTEA

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- companies ---
    op.create_table(
        "companies",
        sa.Column("code", sa.String(30), primary_key=True),
        sa.Column("full_name", sa.String(200), unique=True, nullable=False),
        sa.Column("short_name", sa.String(50), nullable=False),
        sa.Column("region", sa.String(20), nullable=False),
        sa.Column("category", sa.String(20)),
        sa.Column("social_policy", sa.String(30), nullable=False),
        sa.Column("finance_contact", sa.String(100)),
        sa.Column("seal_person", sa.String(200)),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- employees ---
    op.create_table(
        "employees",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("employee_no", sa.String(30), unique=True, nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("company_code", sa.String(30), sa.ForeignKey("companies.code")),
        sa.Column("company_full_name", sa.String(200), nullable=False),
        sa.Column("department", sa.String(100)),
        sa.Column("position", sa.String(100)),
        sa.Column("tax_type", sa.String(15), nullable=False, server_default="normal"),
        sa.Column("social_status", sa.String(20), nullable=False, server_default="有社保"),
        sa.Column("social_base", sa.Numeric(12, 2)),
        sa.Column("housing_fund_base", sa.Numeric(12, 2)),
        sa.Column("bank_account", BYTEA),
        sa.Column("id_number", BYTEA),
        sa.Column("join_date", sa.Date()),
        sa.Column("leave_date", sa.Date()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- salary_records ---
    op.create_table(
        "salary_records",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.BigInteger(), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("month_number", sa.Integer(), nullable=False),
        # Income items
        sa.Column("base_salary", sa.Numeric(12, 2)),
        sa.Column("allowance", sa.Numeric(12, 2), server_default="0"),
        sa.Column("attendance_adjust", sa.Numeric(12, 2), server_default="0"),
        sa.Column("insurance_comm", sa.Numeric(12, 2), server_default="0"),
        sa.Column("kpi_provision", sa.Numeric(12, 2), server_default="0"),
        sa.Column("office_comm", sa.Numeric(12, 2), server_default="0"),
        sa.Column("performance", sa.Numeric(12, 2), server_default="0"),
        sa.Column("apartment_comm", sa.Numeric(12, 2), server_default="0"),
        sa.Column("heat_allowance", sa.Numeric(12, 2), server_default="0"),
        sa.Column("other_allowance", sa.Numeric(12, 2), server_default="0"),
        sa.Column("security_bonus", sa.Numeric(12, 2), server_default="0"),
        sa.Column("cleaning_bonus", sa.Numeric(12, 2), server_default="0"),
        # Calculated fields
        sa.Column("monthly_wage", sa.Numeric(12, 2)),
        sa.Column("wage_subtotal", sa.Numeric(12, 2)),
        sa.Column("personal_welfare", sa.Numeric(12, 2)),
        sa.Column("company_welfare", sa.Numeric(12, 2)),
        sa.Column("tax_amount", sa.Numeric(12, 2)),
        sa.Column("net_pay", sa.Numeric(12, 2)),
        sa.Column("total_cost", sa.Numeric(12, 2)),
        # Tax engine
        sa.Column("cumul_taxable_income", sa.Numeric(14, 2)),
        sa.Column("cumul_tax_paid", sa.Numeric(14, 2)),
        sa.Column("tax_bracket_level", sa.Integer()),
        # Special deductions
        sa.Column("child_edu_deduct", sa.Numeric(12, 2), server_default="0"),
        sa.Column("mortgage_deduct", sa.Numeric(12, 2), server_default="0"),
        sa.Column("rent_deduct", sa.Numeric(12, 2), server_default="0"),
        sa.Column("elder_care_deduct", sa.Numeric(12, 2), server_default="0"),
        sa.Column("education_deduct", sa.Numeric(12, 2), server_default="0"),
        # Lock
        sa.Column("is_locked", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("locked_reason", sa.Text()),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("employee_id", "period", name="uq_salary_employee_period"),
    )

    # --- social_policies ---
    op.create_table(
        "social_policies",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("company_code", sa.String(30), sa.ForeignKey("companies.code")),
        sa.Column("effective_date", sa.Date(), nullable=False),
        # Personal rates
        sa.Column("pension_rate_p", sa.Numeric(6, 4)),
        sa.Column("medical_rate_p", sa.Numeric(6, 4)),
        sa.Column("medical_fixed_p", sa.Numeric(8, 2), server_default="0"),
        sa.Column("unemployment_rate_p", sa.Numeric(6, 4)),
        sa.Column("housing_fund_rate_p", sa.Numeric(6, 4)),
        sa.Column("supp_housing_rate_p", sa.Numeric(6, 4), server_default="0"),
        # Company rates
        sa.Column("pension_rate_c", sa.Numeric(6, 4)),
        sa.Column("medical_rate_c", sa.Numeric(6, 4)),
        sa.Column("unemployment_rate_c", sa.Numeric(6, 4)),
        sa.Column("injury_rate_c", sa.Numeric(6, 4)),
        sa.Column("maternity_rate_c", sa.Numeric(6, 4)),
        sa.Column("housing_fund_rate_c", sa.Numeric(6, 4)),
        sa.Column("rounding_method", sa.String(10), server_default="ROUND"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.UniqueConstraint("company_code", "effective_date", name="uq_social_policy_company_date"),
    )

    # --- tax_brackets ---
    op.create_table(
        "tax_brackets",
        sa.Column("level", sa.Integer(), primary_key=True),
        sa.Column("min_income", sa.Numeric(14, 2)),
        sa.Column("max_income", sa.Numeric(14, 2)),
        sa.Column("rate", sa.Numeric(5, 4)),
        sa.Column("quick_deduction", sa.Numeric(12, 2)),
    )

    # --- attendance_records ---
    op.create_table(
        "attendance_records",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.BigInteger(), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("sick_days", sa.Numeric(5, 1), server_default="0"),
        sa.Column("personal_days", sa.Numeric(5, 1), server_default="0"),
        sa.Column("annual_leave", sa.Numeric(5, 1), server_default="0"),
        sa.Column("overtime_days", sa.Numeric(5, 1), server_default="0"),
        sa.Column("adjustment_amount", sa.Numeric(12, 2), server_default="0"),
        sa.UniqueConstraint("employee_id", "period", name="uq_attendance_employee_period"),
    )

    # --- audit_logs ---
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("table_name", sa.String(50), nullable=False),
        sa.Column("record_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column("user_id", sa.String(50)),
        sa.Column("before_val", JSONB),
        sa.Column("after_val", JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("attendance_records")
    op.drop_table("tax_brackets")
    op.drop_table("social_policies")
    op.drop_table("salary_records")
    op.drop_table("employees")
    op.drop_table("companies")
