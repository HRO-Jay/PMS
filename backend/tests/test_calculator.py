"""
Unit tests for calculator.py — Core payroll calculation engine.
"""
import pytest
from decimal import Decimal

from app.services.calculator import (
    calc_monthly_wage,
    calc_wage_subtotal,
    calc_attendance_adjust,
    calc_bank_payout,
    calc_total_labor_cost,
    sum_special_deductions,
)
from app.utils.rounding import (
    round_half_up,
    round_always_up,
    get_rounding_fn,
)


class TestRounding:
    """Tests for rounding utilities."""

    def test_round_half_up_normal(self):
        assert round_half_up(Decimal("100.555"), 2) == Decimal("100.56")
        assert round_half_up(Decimal("100.554"), 2) == Decimal("100.55")

    def test_round_half_up_integer(self):
        assert round_half_up(Decimal("100"), 2) == Decimal("100.00")

    def test_round_always_up(self):
        assert round_always_up(Decimal("100.001"), 2) == Decimal("100.01")
        assert round_always_up(Decimal("100.990"), 2) == Decimal("100.99")

    def test_round_always_up_exact(self):
        assert round_always_up(Decimal("100.00"), 2) == Decimal("100.00")

    def test_get_rounding_fn_round(self):
        fn = get_rounding_fn("ROUND")
        assert fn(Decimal("10.555"), 2) == Decimal("10.56")

    def test_get_rounding_fn_roundup(self):
        fn = get_rounding_fn("ROUNDUP")
        assert fn(Decimal("10.001"), 2) == Decimal("10.01")

    def test_get_rounding_fn_round_1dec(self):
        fn = get_rounding_fn("ROUND_1DEC")
        # Shenzhen: 1 decimal for housing fund
        assert fn(Decimal("10.15"), 1) == Decimal("10.2")  # round half up to 1
        assert fn(Decimal("10.14"), 1) == Decimal("10.1")

    def test_get_rounding_fn_default(self):
        fn = get_rounding_fn("UNKNOWN")
        assert fn(Decimal("10.555"), 2) == Decimal("10.56")


class TestMonthlyWage:
    """F1 — 本月工资."""

    def test_basic(self):
        result = calc_monthly_wage(
            base=Decimal("15000"),
            allowance=Decimal("500"),
            attend_adj=Decimal("-300"),
            comm_ins=Decimal("0"),
            kpi=Decimal("0"),
        )
        assert result == Decimal("15200.00")

    def test_with_kpi(self):
        result = calc_monthly_wage(
            base=Decimal("15000"),
            allowance=Decimal("500"),
            attend_adj=Decimal("0"),
            comm_ins=Decimal("0"),
            kpi=Decimal("2000"),
        )
        assert result == Decimal("17500.00")

    def test_negative_adjust(self):
        result = calc_monthly_wage(
            base=Decimal("15000"),
            allowance=Decimal("500"),
            attend_adj=Decimal("-689.66"),
            comm_ins=Decimal("0"),
            kpi=Decimal("0"),
        )
        assert result == Decimal("14810.34")


class TestWageSubtotal:
    """F2 — 薪资小计."""

    def test_basic(self):
        result = calc_wage_subtotal(
            monthly_wage=Decimal("15000"),
            comm_office=Decimal("2000"),
            perf=Decimal("1000"),
            comm_apt=Decimal("0"),
            heat_allow=Decimal("0"),
            allowance_other=Decimal("0"),
            sec_bonus=Decimal("0"),
            cln_bonus=Decimal("0"),
        )
        assert result == Decimal("18000.00")

    def test_all_items(self):
        result = calc_wage_subtotal(
            monthly_wage=Decimal("15000"),
            comm_office=Decimal("2000"),
            perf=Decimal("1000"),
            comm_apt=Decimal("500"),
            heat_allow=Decimal("300"),
            allowance_other=Decimal("200"),
            sec_bonus=Decimal("100"),
            cln_bonus=Decimal("100"),
        )
        assert result == Decimal("19200.00")


class TestAttendanceAdjust:
    """考勤调整."""

    def test_no_leave(self):
        result = calc_attendance_adjust(
            base_salary=Decimal("15000"),
            sick_days=Decimal("0"),
            personal_days=Decimal("0"),
            overtime_days=Decimal("0"),
        )
        assert result == Decimal("0.00")

    def test_sick_day(self):
        # 1 sick day: 15000/21.75 × 1 × -0.5 = -344.83
        result = calc_attendance_adjust(
            base_salary=Decimal("15000"),
            sick_days=Decimal("1"),
            personal_days=Decimal("0"),
            overtime_days=Decimal("0"),
        )
        expected = round_half_up(
            Decimal("15000") / Decimal("21.75") * Decimal("1") * Decimal("-0.5"), 2
        )
        assert result == expected

    def test_personal_day(self):
        # 1 personal day: 15000/21.75 × 1 × -1.0 = -689.66
        result = calc_attendance_adjust(
            base_salary=Decimal("15000"),
            sick_days=Decimal("0"),
            personal_days=Decimal("1"),
            overtime_days=Decimal("0"),
        )
        expected = round_half_up(
            Decimal("15000") / Decimal("21.75") * Decimal("1") * Decimal("-1.0"), 2
        )
        assert result == expected

    def test_overtime(self):
        # 1 overtime day: 15000/21.75 × 1 × 1.0 = 689.66
        result = calc_attendance_adjust(
            base_salary=Decimal("15000"),
            sick_days=Decimal("0"),
            personal_days=Decimal("0"),
            overtime_days=Decimal("1"),
        )
        expected = round_half_up(
            Decimal("15000") / Decimal("21.75") * Decimal("1") * Decimal("1.0"), 2
        )
        assert result == expected

    def test_mixed(self):
        # 1 sick + 1 personal + 1 overtime
        # sick: -344.83, personal: -689.66, overtime: +689.66
        # total ≈ -344.83
        result = calc_attendance_adjust(
            base_salary=Decimal("15000"),
            sick_days=Decimal("1"),
            personal_days=Decimal("1"),
            overtime_days=Decimal("1"),
        )
        # Expect roughly -344.83 (sick -50% + personal -100% + overtime +100%)
        daily = Decimal("15000") / Decimal("21.75")
        expected = round_half_up(
            daily * Decimal("-0.5") + daily * Decimal("-1.0") + daily * Decimal("1.0"), 2
        )
        assert result == expected

    def test_zero_work_days(self):
        result = calc_attendance_adjust(
            base_salary=Decimal("15000"),
            sick_days=Decimal("1"),
            personal_days=Decimal("0"),
            overtime_days=Decimal("0"),
            work_days=Decimal("0"),
        )
        assert result == Decimal("0.00")


class TestBankPayout:
    """F15 — 银行实发."""

    def test_basic(self):
        result = calc_bank_payout(
            subtotal=Decimal("18000"),
            personal_welfare=Decimal("2100"),
            monthly_tax=Decimal("300"),
        )
        # 18000 - 2100 - 300 = 15600
        assert result == Decimal("15600.00")

    def test_with_adjustments(self):
        result = calc_bank_payout(
            subtotal=Decimal("18000"),
            personal_welfare=Decimal("2100"),
            monthly_tax=Decimal("300"),
            tax_adj_neg=Decimal("50"),
            tax_adj_pos=Decimal("0"),
            off_book=Decimal("0"),
        )
        # 18000 - 2100 - 300 - 50 = 15550
        assert result == Decimal("15550.00")

    def test_zero_tax(self):
        result = calc_bank_payout(
            subtotal=Decimal("5000"),
            personal_welfare=Decimal("0"),
            monthly_tax=Decimal("0"),
        )
        assert result == Decimal("5000.00")


class TestTotalLaborCost:
    """F25 — 企业人力成本."""

    def test_basic(self):
        result = calc_total_labor_cost(
            subtotal=Decimal("18000"),
            company_welfare=Decimal("6000"),
        )
        assert result == Decimal("24000.00")

    def test_with_all_items(self):
        result = calc_total_labor_cost(
            subtotal=Decimal("18000"),
            company_welfare=Decimal("6000"),
            biz_ins=Decimal("100"),
            birthday=Decimal("0"),
            health_fee=Decimal("0"),
            housing_allow=Decimal("0"),
            provision_welfare=Decimal("0"),
            fuping=Decimal("0"),
        )
        assert result == Decimal("24100.00")


class TestSpecialDeductions:
    """专项附加扣除合计."""

    def test_all_zeros(self):
        from app.models.all_models import SalaryRecord
        record = SalaryRecord()
        result = sum_special_deductions(record)
        assert result == Decimal("0")

    def test_with_items(self):
        from app.models.all_models import SalaryRecord
        record = SalaryRecord(
            child_edu_deduct=Decimal("1000"),
            rent_deduct=Decimal("1500"),
        )
        result = sum_special_deductions(record)
        assert result == Decimal("2500")
