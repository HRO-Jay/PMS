"""
Payroll Calculator — Core calculation engine.

Implements all 10 formulas from CLAUDE.md §5:
  F1  = monthly_wage (本月工资)
  F2  = wage_subtotal (薪资小计)
  F3  = personal_welfare total (个人福利合计)
  F11 = income tax — normal (累计预扣法)
  F14 = income tax — service (劳务报酬)
  F15 = bank payout / net pay (银行实发)
  F17 = company welfare total (公司福利合计)
  F25 = total labor cost (企业人力成本)

Plus attendance adjustment calculation.
"""
import logging
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.all_models import (
    Employee, SalaryRecord, SocialPolicy, TaxBracket, AttendanceRecord,
)
from app.services.tax_engine import (
    calc_income_tax_normal, calc_income_tax_service, calc_income_tax_non_taxable,
)
from app.services.social_engine import (
    get_social_policy, get_effective_social_base,
    calc_social_personal, calc_social_company,
)
from app.utils.rounding import round_half_up

logger = logging.getLogger(__name__)

# Standard work days per month (用于考勤折算)
STANDARD_WORK_DAYS = Decimal("21.75")


def calc_monthly_wage(
    base: Decimal, allowance: Decimal, attend_adj: Decimal,
    comm_ins: Decimal, kpi: Decimal,
) -> Decimal:
    """
    F1 — 本月工资 = 基本工资 + 补贴 + 考勤调整 + 商保 + KPI预提
    """
    return round_half_up(
        base + allowance + attend_adj + comm_ins + kpi, 2
    )


def calc_wage_subtotal(
    monthly_wage: Decimal, comm_office: Decimal, perf: Decimal,
    comm_apt: Decimal, heat_allow: Decimal, allowance_other: Decimal,
    sec_bonus: Decimal, cln_bonus: Decimal,
) -> Decimal:
    """
    F2 — 薪资小计 = 本月工资 + 商办佣金 + 绩效 + 公寓佣金 +
                 防暑降温费 + 津贴 + 保安奖金 + 保洁奖金
    """
    return round_half_up(
        monthly_wage + comm_office + perf + comm_apt +
        heat_allow + allowance_other + sec_bonus + cln_bonus, 2
    )


def calc_attendance_adjust(
    base_salary: Decimal,
    sick_days: Decimal,
    personal_days: Decimal,
    overtime_days: Decimal,
    work_days: Decimal = STANDARD_WORK_DAYS,
) -> Decimal:
    """
    Calculate attendance adjustment.

    病假扣 50% 日薪、事假扣 100% 日薪、加班补 100% 日薪、年假不扣款
    """
    if work_days == Decimal("0"):
        return Decimal("0")

    daily_wage = base_salary / work_days
    adjust = Decimal("0")
    adjust += sick_days * daily_wage * Decimal("-0.5")
    adjust += personal_days * daily_wage * Decimal("-1.0")
    adjust += overtime_days * daily_wage * Decimal("1.0")
    # 年假不扣款
    return round_half_up(adjust, 2)


def calc_bank_payout(
    subtotal: Decimal, personal_welfare: Decimal, monthly_tax: Decimal,
    tax_adj_neg: Decimal = Decimal("0"), tax_adj_pos: Decimal = Decimal("0"),
    off_book: Decimal = Decimal("0"),
) -> Decimal:
    """
    F15 — 银行实发 = 薪资小计 - 个人福利 - 个税 - 负调整 + 正调整 + 账外
    """
    return round_half_up(
        subtotal - personal_welfare - monthly_tax - tax_adj_neg + tax_adj_pos + off_book, 2
    )


def calc_total_labor_cost(
    subtotal: Decimal, company_welfare: Decimal,
    biz_ins: Decimal = Decimal("0"), birthday: Decimal = Decimal("0"),
    health_fee: Decimal = Decimal("0"), housing_allow: Decimal = Decimal("0"),
    provision_welfare: Decimal = Decimal("0"), fuping: Decimal = Decimal("0"),
) -> Decimal:
    """
    F25 — 企业人力成本 = 薪资小计 + 公司福利 + 商保 + 生日费 +
                      体检费 + 住房补贴 + 福利费预提 + 扶贫
    """
    return round_half_up(
        subtotal + company_welfare + biz_ins + birthday +
        health_fee + housing_allow + provision_welfare + fuping, 2
    )


def sum_special_deductions(record: SalaryRecord) -> Decimal:
    """Sum all special deductions (专项附加扣除合计)."""
    return (
        (record.child_edu_deduct or Decimal("0"))
        + (record.mortgage_deduct or Decimal("0"))
        + (record.rent_deduct or Decimal("0"))
        + (record.elder_care_deduct or Decimal("0"))
        + (record.education_deduct or Decimal("0"))
    )


class PayrollCalculator:
    """薪资计算主调度器."""

    def __init__(self, db: AsyncSession, period: str):
        """
        Initialize the calculator.

        Args:
            db: Async database session
            period: Payroll period, e.g. '2026-08'
        """
        self.db = db
        self.period = period
        self.month_number = int(period.split("-")[1])

    async def get_active_employees(self) -> list[Employee]:
        """Get all active employees."""
        result = await self.db.execute(
            select(Employee).where(Employee.is_active == True)
        )
        return list(result.scalars().all())

    async def get_attendance(self, employee_id: int) -> AttendanceRecord | None:
        """Get attendance record for an employee for the current period."""
        result = await self.db.execute(
            select(AttendanceRecord).where(
                and_(
                    AttendanceRecord.employee_id == employee_id,
                    AttendanceRecord.period == self.period,
                )
            )
        )
        return result.scalar_one_or_none()

    async def process_employee(
        self, employee: Employee, force_recalc: bool = False,
    ) -> SalaryRecord:
        """
        Full salary calculation for a single employee.

        Steps:
          1. Get social base & policy
          2. Calculate social insurance (personal + company)
          3. Get wage input data for this period
          4. Calculate wage subtotal (F2)
          5. Calculate income tax based on tax_type
          6. Calculate net pay (F15) and total cost (F25)
          7. Save to database
        """
        # Check if record already exists
        result = await self.db.execute(
            select(SalaryRecord).where(
                and_(
                    SalaryRecord.employee_id == employee.id,
                    SalaryRecord.period == self.period,
                )
            )
        )
        existing = result.scalar_one_or_none()

        if existing and existing.is_locked and not force_recalc:
            logger.warning(f"Employee {employee.id} has a locked record for {self.period}")
            return existing

        # Create or reuse salary record
        if existing and force_recalc:
            record = existing
        elif existing:
            record = existing
        else:
            record = SalaryRecord(
                employee_id=employee.id,
                period=self.period,
                month_number=self.month_number,
            )

        # ---------- STEP 1: Social base & policy ----------
        policy = await get_social_policy(self.db, employee.company_code, self.period)
        social_base, housing_base = get_effective_social_base(employee)

        # ---------- STEP 2: Social insurance ----------
        social_p = calc_social_personal(policy, social_base, housing_base)
        social_c = calc_social_company(policy, social_base, housing_base)

        # ---------- STEP 3: Attendance ----------
        attendance = await self.get_attendance(employee.id)
        if attendance:
            base_salary = record.base_salary or Decimal("0")
            attendance_adjust = calc_attendance_adjust(
                base_salary,
                attendance.sick_days or Decimal("0"),
                attendance.personal_days or Decimal("0"),
                attendance.overtime_days or Decimal("0"),
            )
        else:
            attendance_adjust = record.attendance_adjust or Decimal("0")

        # ---------- STEP 4: Monthly wage & subtotal ----------
        monthly_wage = calc_monthly_wage(
            base=(record.base_salary or Decimal("0")),
            allowance=(record.allowance or Decimal("0")),
            attend_adj=attendance_adjust,
            comm_ins=(record.insurance_comm or Decimal("0")),
            kpi=(record.kpi_provision or Decimal("0")),
        )
        record.monthly_wage = monthly_wage
        record.attendance_adjust = attendance_adjust

        wage_subtotal = calc_wage_subtotal(
            monthly_wage=monthly_wage,
            comm_office=(record.office_comm or Decimal("0")),
            perf=(record.performance or Decimal("0")),
            comm_apt=(record.apartment_comm or Decimal("0")),
            heat_allow=(record.heat_allowance or Decimal("0")),
            allowance_other=(record.other_allowance or Decimal("0")),
            sec_bonus=(record.security_bonus or Decimal("0")),
            cln_bonus=(record.cleaning_bonus or Decimal("0")),
        )
        record.wage_subtotal = wage_subtotal
        record.personal_welfare = social_p["total"]
        record.company_welfare = social_c["total"]

        # ---------- STEP 5: Income tax ----------
        special_deduct_total = sum_special_deductions(record)

        if employee.tax_type == "normal":
            if policy is not None:
                tax_result = await calc_income_tax_normal(
                    self.db, employee, self.month_number,
                    wage_subtotal, social_p["total"], special_deduct_total,
                    self.period,
                )
            else:
                # No social policy → still run tax on wages alone
                tax_result = await calc_income_tax_normal(
                    self.db, employee, self.month_number,
                    wage_subtotal, Decimal("0"), special_deduct_total,
                    self.period,
                )
            record.tax_amount = tax_result["monthly_tax"]
            record.cumul_taxable_income = tax_result["cumul_income"]
            record.cumul_tax_paid = tax_result["cumul_tax"]
            record.tax_bracket_level = tax_result["tax_bracket_level"]
        elif employee.tax_type == "service":
            record.tax_amount = calc_income_tax_service(wage_subtotal)
            record.cumul_taxable_income = None
            record.cumul_tax_paid = None
            record.tax_bracket_level = None
        else:  # non_taxable
            record.tax_amount = Decimal("0")
            record.cumul_taxable_income = None
            record.cumul_tax_paid = None
            record.tax_bracket_level = None

        # ---------- STEP 6: Net pay & total cost ----------
        record.net_pay = calc_bank_payout(
            subtotal=wage_subtotal,
            personal_welfare=social_p["total"],
            monthly_tax=(record.tax_amount or Decimal("0")),
        )
        record.total_cost = calc_total_labor_cost(
            subtotal=wage_subtotal,
            company_welfare=social_c["total"],
        )

        # ---------- STEP 7: Save ----------
        self.db.add(record)
        await self.db.flush()
        return record

    async def run_full_cycle(self) -> dict:
        """
        Run a full payroll cycle — process all active employees.

        Returns:
            dict with 'success' (list of employee IDs) and 'errors' (list of dicts).
        """
        employees = await self.get_active_employees()
        results = {"success": [], "errors": []}

        for emp in employees:
            try:
                await self.process_employee(emp)
                results["success"].append(emp.id)
            except Exception as e:
                logger.exception(f"Failed to process employee {emp.id}: {e}")
                results["errors"].append({"emp_id": emp.id, "employee_no": emp.employee_no, "error": str(e)})

        return results

    async def calculate_single_employee(
        self, employee_id: int, force_recalc: bool = False,
    ) -> SalaryRecord:
        """
        Calculate salary for a single employee.

        Args:
            employee_id: Employee primary key
            force_recalc: If True, recalculate even if record is locked

        Returns:
            The saved SalaryRecord
        """
        result = await self.db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = result.scalar_one_or_none()
        if employee is None:
            raise ValueError(f"Employee {employee_id} not found")

        if not employee.is_active:
            raise ValueError(f"Employee {employee_id} is not active")

        return await self.process_employee(employee, force_recalc=force_recalc)
