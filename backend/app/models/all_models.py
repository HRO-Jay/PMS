"""
SQLAlchemy ORM models for Payroll Management System.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB, BYTEA
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.deps import Base


class Company(Base):
    """公司信息表 — 27 companies from company_mapping.json."""

    __tablename__ = "companies"

    code: Mapped[str] = mapped_column(String(30), primary_key=True, comment="公司编码")
    full_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, comment="工商注册全称")
    short_name: Mapped[str] = mapped_column(String(50), nullable=False, comment="简称（仅用于 Excel 兼容）")
    region: Mapped[str] = mapped_column(String(20), nullable=False, comment="地区：上海/北京/天津/深圳/南京/香港")
    category: Mapped[Optional[str]] = mapped_column(String(20), comment="分类：人才系/投资系/香港系/其他")
    social_policy: Mapped[str] = mapped_column(String(30), nullable=False, comment="社保策略")
    finance_contact: Mapped[Optional[str]] = mapped_column(String(100))
    seal_person: Mapped[Optional[str]] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employees: Mapped[list["Employee"]] = relationship(back_populates="company")
    social_policies: Mapped[list["SocialPolicy"]] = relationship(back_populates="company")


class Employee(Base):
    """员工花名册."""

    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, comment="员工编号")
    name: Mapped[str] = mapped_column(String(50), nullable=False, comment="姓名")
    company_code: Mapped[str] = mapped_column(String(30), ForeignKey("companies.code"), comment="所属公司编码")
    company_full_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="公司全称（反范式化）")
    department: Mapped[Optional[str]] = mapped_column(String(100), comment="部门")
    position: Mapped[Optional[str]] = mapped_column(String(100), comment="岗位")
    tax_type: Mapped[str] = mapped_column(String(15), nullable=False, default="normal", comment="计税模式: normal/service/non_taxable")
    social_status: Mapped[str] = mapped_column(String(20), nullable=False, default="有社保", comment="社保状态: 有社保/无社保/残疾人")
    social_base: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="社保基数")
    housing_fund_base: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="公积金基数")
    bank_account: Mapped[Optional[bytes]] = mapped_column(BYTEA, comment="银行账号（AES-256 加密）")
    id_number: Mapped[Optional[bytes]] = mapped_column(BYTEA, comment="身份证号（AES-256 加密）")
    join_date: Mapped[Optional[date]] = mapped_column(Date)
    leave_date: Mapped[Optional[date]] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company: Mapped["Company"] = relationship(back_populates="employees")
    salary_records: Mapped[list["SalaryRecord"]] = relationship(back_populates="employee")
    attendance_records: Mapped[list["AttendanceRecord"]] = relationship(back_populates="employee")


class SalaryRecord(Base):
    """薪资记录 — 每个员工每月一条."""

    __tablename__ = "salary_records"
    __table_args__ = (
        UniqueConstraint("employee_id", "period", name="uq_salary_employee_period"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False, comment="月份: YYYY-MM")
    month_number: Mapped[int] = mapped_column(Integer, nullable=False, comment="1-12, 用于个税累计")

    # ---------- 收入项 (manual input) ----------
    base_salary: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="基本工资")
    allowance: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="补贴")
    attendance_adjust: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="考勤调整")
    insurance_comm: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="商保佣金")
    kpi_provision: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="KPI预提")
    office_comm: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="商办佣金")
    performance: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="绩效")
    apartment_comm: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="公寓佣金")
    heat_allowance: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="防暑降温费")
    other_allowance: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="津贴")
    security_bonus: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="保安奖金")
    cleaning_bonus: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="保洁奖金")

    # ---------- 计算字段 ----------
    monthly_wage: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="本月工资 F1")
    wage_subtotal: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="薪资小计 F2")
    personal_welfare: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="个人福利合计 F3")
    company_welfare: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="公司福利合计 F17")
    tax_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="个税 F11/F14")
    net_pay: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="银行实发 F15")
    total_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), comment="企业人力成本 F25")

    # ---------- 个税引擎字段 ----------
    cumul_taxable_income: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), comment="累计应纳税所得额")
    cumul_tax_paid: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), comment="累计已缴税额")
    tax_bracket_level: Mapped[Optional[int]] = mapped_column(Integer, comment="适用税率级数")

    # ---------- 专项附加扣除 ----------
    child_edu_deduct: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0)
    mortgage_deduct: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0)
    rent_deduct: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0)
    elder_care_deduct: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0)
    education_deduct: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0)

    # ---------- 锁定 ----------
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    locked_reason: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee: Mapped["Employee"] = relationship(back_populates="salary_records")


class SocialPolicy(Base):
    """社保费率配置（按公司和生效日期版本化）."""

    __tablename__ = "social_policies"
    __table_args__ = (
        UniqueConstraint("company_code", "effective_date", name="uq_social_policy_company_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    company_code: Mapped[str] = mapped_column(String(30), ForeignKey("companies.code"), comment="公司编码")
    effective_date: Mapped[date] = mapped_column(Date, nullable=False, comment="生效日期")

    # 个人费率
    pension_rate_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="个人养老费率")
    medical_rate_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="个人医疗费率")
    medical_fixed_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), default=0, comment="个人医疗固定附加费")
    unemployment_rate_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="个人失业费率")
    housing_fund_rate_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="个人公积金费率")
    supp_housing_rate_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), default=0, comment="个人补充公积金费率")

    # 公司费率
    pension_rate_c: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="公司养老费率")
    medical_rate_c: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="公司医疗费率")
    unemployment_rate_c: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="公司失业费率")
    injury_rate_c: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="公司工伤费率")
    maternity_rate_c: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="公司生育费率")
    housing_fund_rate_c: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), comment="公司公积金费率")

    rounding_method: Mapped[str] = mapped_column(String(10), default="ROUND", comment="取整方式: ROUND/ROUNDUP/ROUND_1DEC")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    company: Mapped["Company"] = relationship(back_populates="social_policies")


class TaxBracket(Base):
    """七级累进个税税率表."""

    __tablename__ = "tax_brackets"

    level: Mapped[int] = mapped_column(Integer, primary_key=True, comment="级数 1-7")
    min_income: Mapped[Decimal] = mapped_column(Numeric(14, 2), comment="区间下限")
    max_income: Mapped[Decimal] = mapped_column(Numeric(14, 2), comment="区间上限")
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), comment="税率")
    quick_deduction: Mapped[Decimal] = mapped_column(Numeric(12, 2), comment="速算扣除数")


class AttendanceRecord(Base):
    """考勤记录."""

    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("employee_id", "period", name="uq_attendance_employee_period"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False, comment="月份: YYYY-MM")
    sick_days: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 1), default=0, comment="病假天数")
    personal_days: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 1), default=0, comment="事假天数")
    annual_leave: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 1), default=0, comment="年假天数")
    overtime_days: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 1), default=0, comment="加班天数")
    adjustment_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), default=0, comment="调整金额")

    employee: Mapped["Employee"] = relationship(back_populates="attendance_records")


class AuditLog(Base):
    """审计日志 — JSONB before/after."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    table_name: Mapped[str] = mapped_column(String(50), nullable=False, comment="表名")
    record_id: Mapped[int] = mapped_column(BigInteger, nullable=False, comment="记录ID")
    action: Mapped[str] = mapped_column(String(10), nullable=False, comment="INSERT/UPDATE/DELETE")
    user_id: Mapped[Optional[str]] = mapped_column(String(50), comment="操作用户UUID")
    before_val: Mapped[Optional[dict]] = mapped_column(JSONB, comment="变更前")
    after_val: Mapped[Optional[dict]] = mapped_column(JSONB, comment="变更后")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
