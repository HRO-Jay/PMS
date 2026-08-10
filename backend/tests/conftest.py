"""
Pytest configuration and fixtures.
"""
import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def mock_db():
    """Mock async database session."""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.close = AsyncMock()
    session.flush = AsyncMock()
    session.execute = AsyncMock()
    return session


@pytest.fixture
def sample_employee_data():
    """Sample employee data for tests."""
    return {
        "id": 1,
        "employee_no": "EMP001",
        "name": "张三",
        "company_code": "KAIYI_INFO",
        "company_full_name": "开弈信息科技（中国）有限公司",
        "department": "技术部",
        "position": "工程师",
        "tax_type": "normal",
        "social_status": "有社保",
        "social_base": Decimal("12000"),
        "housing_fund_base": Decimal("12000"),
        "is_active": True,
    }


@pytest.fixture
def sample_salary_input():
    """Sample salary input data for tests."""
    return {
        "base_salary": Decimal("15000"),
        "allowance": Decimal("500"),
        "attendance_adjust": Decimal("0"),
        "insurance_comm": Decimal("0"),
        "kpi_provision": Decimal("0"),
        "office_comm": Decimal("0"),
        "performance": Decimal("1000"),
        "apartment_comm": Decimal("0"),
        "heat_allowance": Decimal("0"),
        "other_allowance": Decimal("0"),
        "security_bonus": Decimal("0"),
        "cleaning_bonus": Decimal("0"),
    }
