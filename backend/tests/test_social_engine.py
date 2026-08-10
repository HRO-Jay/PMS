"""
Unit tests for social_engine.py — Social insurance calculations.
"""
import pytest
from decimal import Decimal

from app.services.social_engine import (
    get_effective_social_base,
    calc_social_personal,
    calc_social_company,
    DISABLED_SOCIAL_BASE,
    get_rounding_fn,
)
from app.utils.rounding import round_half_up, round_always_up


class TestSocialBase:
    """社保基数计算."""

    def test_normal_employee(self):
        """普通员工使用配置的基数."""
        from unittest.mock import MagicMock
        emp = MagicMock()
        emp.social_status = "有社保"
        emp.social_base = Decimal("12000")
        emp.housing_fund_base = Decimal("12000")

        social_base, housing_base = get_effective_social_base(emp)
        assert social_base == Decimal("12000")
        assert housing_base == Decimal("12000")

    def test_disabled_employee(self):
        """残疾人固定基数为 7460."""
        from unittest.mock import MagicMock
        emp = MagicMock()
        emp.social_status = "残疾人"
        emp.social_base = Decimal("10000")  # Ignored
        emp.housing_fund_base = Decimal("10000")

        social_base, housing_base = get_effective_social_base(emp)
        assert social_base == Decimal("7460")

    def test_no_social(self):
        """无社保员工."""
        from unittest.mock import MagicMock
        emp = MagicMock()
        emp.social_status = "无社保"
        emp.social_base = Decimal("12000")
        emp.housing_fund_base = Decimal("12000")

        social_base, housing_base = get_effective_social_base(emp)
        assert social_base == Decimal("12000")  # base still stored

    def test_none_base_defaults_to_zero(self):
        """未设置基数的默认 0."""
        from unittest.mock import MagicMock
        emp = MagicMock()
        emp.social_status = "有社保"
        emp.social_base = None
        emp.housing_fund_base = None

        social_base, housing_base = get_effective_social_base(emp)
        assert social_base == Decimal("0")
        assert housing_base == Decimal("0")


class TestShangHaiSocialPersonal:
    """上海标准 — 个人社保计算."""

    def make_policy(self):
        from unittest.mock import MagicMock
        p = MagicMock()
        p.pension_rate_p = Decimal("0.08")
        p.medical_rate_p = Decimal("0.02")
        p.medical_fixed_p = Decimal("3")
        p.unemployment_rate_p = Decimal("0.005")
        p.housing_fund_rate_p = Decimal("0.07")
        p.supp_housing_rate_p = Decimal("0")
        p.rounding_method = "ROUND"
        return p

    def test_full_calculation(self):
        """Base 12000, standard Shanghai rates."""
        policy = self.make_policy()
        result = calc_social_personal(policy, Decimal("12000"), Decimal("12000"))

        # 养老: 12000 × 8% = 960
        # 医疗: 12000 × 2% + 3 = 243
        # 失业: 12000 × 0.5% = 60
        # 公积金: 12000 × 7% = 840
        # 补充公积金: 0
        # Total: 960 + 243 + 60 + 840 = 2103
        assert result["pension"] == Decimal("960.00")
        assert result["medical"] == Decimal("243.00")
        assert result["unemployment"] == Decimal("60.00")
        assert result["housing"] == Decimal("840.00")
        assert result["supp_housing"] == Decimal("0.00")
        assert result["total"] == Decimal("2103.00")

    def test_different_base(self):
        """Different social and housing bases."""
        policy = self.make_policy()
        result = calc_social_personal(policy, Decimal("7310"), Decimal("7310"))

        # 养老: 7310 × 8% = 584.80
        # 医疗: 7310 × 2% + 3 = 149.20
        # 失业: 7310 × 0.5% = 36.55
        # 公积金: 7310 × 7% = 511.70
        # Total: 584.80 + 149.20 + 36.55 + 511.70 = 1282.25
        assert result["pension"] == Decimal("584.80")
        assert result["medical"] == Decimal("149.20")
        assert result["unemployment"] == Decimal("36.55")
        assert result["housing"] == Decimal("511.70")
        assert result["total"] == Decimal("1282.25")


class TestBeijingSocialPersonal:
    """北京标准 (ROUNDUP) — 个人社保计算."""

    def make_policy(self):
        from unittest.mock import MagicMock
        p = MagicMock()
        p.pension_rate_p = Decimal("0.08")
        p.medical_rate_p = Decimal("0.02")
        p.medical_fixed_p = Decimal("3")
        p.unemployment_rate_p = Decimal("0.005")
        p.housing_fund_rate_p = Decimal("0.12")
        p.supp_housing_rate_p = Decimal("0")
        p.rounding_method = "ROUNDUP"
        return p

    def test_full_calculation_roundup(self):
        """Base 12000, Beijing rates — all round UP."""
        policy = self.make_policy()
        result = calc_social_personal(policy, Decimal("12000"), Decimal("12000"))

        # 养老: 12000 × 8% = 960.00
        # 医疗: 12000 × 2% + 3 = 243.00
        # 失业: 12000 × 0.5% = 60.00
        # 公积金: 12000 × 12% = 1440.00
        # Total: 960 + 243 + 60 + 1440 = 2703
        assert result["pension"] == Decimal("960.00")
        assert result["medical"] == Decimal("243.00")
        assert result["unemployment"] == Decimal("60.00")
        assert result["housing"] == Decimal("1440.00")
        assert result["total"] == Decimal("2703.00")

    def test_roundup_edge_case(self):
        """Test ROUNDUP on a value that would round at .001."""
        policy = self.make_policy()
        # 10001 × 8% = 800.08 — with ROUNDUP, still 800.08?
        # Actually ROUNDUP at 2 decimals: 800.08 stays 800.08
        result = calc_social_personal(policy, Decimal("10001"), Decimal("10001"))
        assert result["pension"] == Decimal("800.08")


class TestTianJinSocialPersonal:
    """天津标准."""

    def make_policy(self):
        from unittest.mock import MagicMock
        p = MagicMock()
        p.pension_rate_p = Decimal("0.08")
        p.medical_rate_p = Decimal("0.02")
        p.medical_fixed_p = Decimal("0")
        p.unemployment_rate_p = Decimal("0.005")
        p.housing_fund_rate_p = Decimal("0.11")
        p.supp_housing_rate_p = Decimal("0")
        p.rounding_method = "ROUND"
        return p

    def test_full_calculation(self):
        policy = self.make_policy()
        result = calc_social_personal(policy, Decimal("12000"), Decimal("12000"))

        # 养老: 12000 × 8% = 960
        # 医疗: 12000 × 2% + 0 = 240 (no medical_fixed_p!)
        # 失业: 12000 × 0.5% = 60
        # 公积金: 12000 × 11% = 1320
        # Total: 960 + 240 + 60 + 1320 = 2580
        assert result["medical"] == Decimal("240.00")
        assert result["housing"] == Decimal("1320.00")
        assert result["total"] == Decimal("2580.00")


class TestShenZhenSocialPersonal:
    """深圳标准 (ROUND_1DEC for housing fund)."""

    def make_policy(self):
        from unittest.mock import MagicMock
        p = MagicMock()
        p.pension_rate_p = Decimal("0.08")
        p.medical_rate_p = Decimal("0.02")
        p.medical_fixed_p = Decimal("0")
        p.unemployment_rate_p = Decimal("0.003")
        p.housing_fund_rate_p = Decimal("0.05")
        p.supp_housing_rate_p = Decimal("0")
        p.rounding_method = "ROUND_1DEC"
        return p

    def test_housing_1dec(self):
        """Shenzhen: housing fund rounded to 1 decimal."""
        # NOTE: The rounding applies to ALL values, not just housing.
        # 12000 × 5% = 600.0 (already 1 decimal)
        policy = self.make_policy()
        result = calc_social_personal(policy, Decimal("12000"), Decimal("12000"))

        assert result["unemployment"] == Decimal("36.0")  # 0.3%
        assert result["housing"] == Decimal("600.0")  # 5%


class TestCompanySideCalculations:
    """公司侧社保计算."""

    def test_shanghai_company(self):
        from unittest.mock import MagicMock
        p = MagicMock()
        p.pension_rate_c = Decimal("0.16")
        p.medical_rate_c = Decimal("0.09")
        p.unemployment_rate_c = Decimal("0.005")
        p.injury_rate_c = Decimal("0.002")
        p.maternity_rate_c = Decimal("0.01")
        p.housing_fund_rate_c = Decimal("0.07")
        p.rounding_method = "ROUND"

        result = calc_social_company(p, Decimal("12000"), Decimal("12000"))

        # 养老: 12000 × 16% = 1920
        # 医疗: 12000 × 9% = 1080
        # 失业: 12000 × 0.5% = 60
        # 工伤: 12000 × 0.2% = 24
        # 生育: 12000 × 1% = 120
        # 公积金: 12000 × 7% = 840
        # Total: 1920 + 1080 + 60 + 24 + 120 + 840 = 4044
        assert result["pension"] == Decimal("1920.00")
        assert result["medical"] == Decimal("1080.00")
        assert result["unemployment"] == Decimal("60.00")
        assert result["injury"] == Decimal("24.00")
        assert result["maternity"] == Decimal("120.00")
        assert result["housing"] == Decimal("840.00")
        assert result["total"] == Decimal("4044.00")


class TestDisabledEmployee:
    """残疾人固定基数."""

    def test_disabled_base(self):
        assert DISABLED_SOCIAL_BASE == Decimal("7460")
