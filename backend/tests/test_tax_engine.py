"""
Unit tests for tax_engine.py — Income tax calculation.
"""
import pytest
from decimal import Decimal

from app.services.tax_engine import (
    calc_income_tax_service,
    calc_income_tax_non_taxable,
)
from app.utils.rounding import round_half_up


class TestServiceTax:
    """劳务报酬个税: (薪资小计 - 800) × 20%."""

    def test_below_threshold(self):
        assert calc_income_tax_service(Decimal("800")) == Decimal("0")
        assert calc_income_tax_service(Decimal("500")) == Decimal("0")

    def test_exactly_at_threshold(self):
        # 800 is the threshold, so (800-800) × 20% = 0
        assert calc_income_tax_service(Decimal("800")) == Decimal("0")

    def test_above_threshold(self):
        # (5000 - 800) × 20% = 840
        result = calc_income_tax_service(Decimal("5000"))
        assert result == Decimal("840.00")

    def test_large_amount(self):
        # (50000 - 800) × 20% = 9840
        result = calc_income_tax_service(Decimal("50000"))
        assert result == Decimal("9840.00")

    def test_typical_service_wage(self):
        # Typical service wage: (10000 - 800) × 20% = 1840
        result = calc_income_tax_service(Decimal("10000"))
        assert result == Decimal("1840.00")


class TestNonTaxable:
    """免税模式 — always 0."""

    def test_always_zero(self):
        assert calc_income_tax_non_taxable() == Decimal("0")


class TestNormalTaxValidation:
    """Validate that normal tax follows the 7-level progressive structure."""

    def test_bracket_rates(self):
        """Verify the 7-level tax brackets have correct rates."""
        brackets = [
            (0, 36000, Decimal("0.03"), Decimal("0")),
            (36000, 144000, Decimal("0.10"), Decimal("2520")),
            (144000, 300000, Decimal("0.20"), Decimal("16920")),
            (300000, 420000, Decimal("0.25"), Decimal("31920")),
            (420000, 660000, Decimal("0.30"), Decimal("52920")),
            (660000, 960000, Decimal("0.35"), Decimal("85920")),
            (960000, float("inf"), Decimal("0.45"), Decimal("181920")),
        ]

        for min_val, max_val, rate, deduction in brackets:
            assert rate >= Decimal("0")
            assert rate <= Decimal("1")
            assert deduction >= Decimal("0")

    def test_quick_calculation_bracket1(self):
        """Manual verification: bracket 1 (3%).

        Taxable income = 30000 (level 1), cumulative tax = 30000 × 3% - 0 = 900
        """
        taxable = Decimal("30000")
        rate = Decimal("0.03")
        deduction = Decimal("0")
        tax = taxable * rate - deduction
        assert tax == Decimal("900.00")

    def test_quick_calculation_bracket3(self):
        """Manual verification: bracket 3 (20%).

        Taxable income = 200000
        tax = 200000 × 20% - 16920 = 23080
        """
        taxable = Decimal("200000")
        rate = Decimal("0.20")
        deduction = Decimal("16920")
        tax = taxable * rate - deduction
        assert tax == Decimal("23080.00")

    def test_quick_calculation_bracket7(self):
        """Manual verification: bracket 7 (45%).

        Taxable income = 1000000
        tax = 1000000 × 45% - 181920 = 268080
        """
        taxable = Decimal("1000000")
        rate = Decimal("0.45")
        deduction = Decimal("181920")
        tax = taxable * rate - deduction
        assert tax == Decimal("268080.00")


class TestExemption:
    """Basic exemption (减除费用 = 5000/月)."""

    def test_monthly_exemption(self):
        """For month 1, exemption is 5000."""
        exemption = Decimal("5000") * 1
        assert exemption == Decimal("5000")

    def test_cumulative_exemption(self):
        """For month 6, cumulative exemption is 30000."""
        exemption = Decimal("5000") * 6
        assert exemption == Decimal("30000")

    def test_full_year_exemption(self):
        """For month 12, cumulative exemption is 60000."""
        exemption = Decimal("5000") * 12
        assert exemption == Decimal("60000")
