-- ============================================================
--  payroll-system initial migration
--  Supabase PostgreSQL 15 — 2026-08-10
--  Full legal company names (工商注册名) — DO NOT abbreviate
-- ============================================================

-- ---------- companies ----------
CREATE TABLE IF NOT EXISTS companies (
    code            VARCHAR(30)  PRIMARY KEY,
    full_name       VARCHAR(200) NOT NULL UNIQUE,
    short_name      VARCHAR(50)  NOT NULL,
    region          VARCHAR(20)  NOT NULL,
    category        VARCHAR(20),
    social_policy   VARCHAR(30)  NOT NULL,
    finance_contact VARCHAR(100),
    seal_person     VARCHAR(200),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- employees ----------
CREATE TABLE IF NOT EXISTS employees (
    id                  BIGSERIAL PRIMARY KEY,
    employee_no         VARCHAR(30)  UNIQUE NOT NULL,
    name                VARCHAR(50)  NOT NULL,
    company_code        VARCHAR(30)  REFERENCES companies(code),
    company_full_name   VARCHAR(200) NOT NULL,
    department          VARCHAR(100),
    position            VARCHAR(100),
    tax_type            VARCHAR(15)  NOT NULL DEFAULT 'normal',
    social_status       VARCHAR(20)  NOT NULL DEFAULT '有社保',
    social_base         DECIMAL(12,2),
    housing_fund_base   DECIMAL(12,2),
    bank_account        BYTEA,
    id_number           BYTEA,
    join_date           DATE,
    leave_date          DATE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- salary_records ----------
CREATE TABLE IF NOT EXISTS salary_records (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT REFERENCES employees(id),
    period              VARCHAR(7)   NOT NULL,
    month_number        INT          NOT NULL,

    -- Income items (manual input)
    base_salary         DECIMAL(12,2),
    allowance           DECIMAL(12,2) DEFAULT 0,
    attendance_adjust   DECIMAL(12,2) DEFAULT 0,
    insurance_comm      DECIMAL(12,2) DEFAULT 0,
    kpi_provision       DECIMAL(12,2) DEFAULT 0,
    office_comm         DECIMAL(12,2) DEFAULT 0,
    performance         DECIMAL(12,2) DEFAULT 0,
    apartment_comm      DECIMAL(12,2) DEFAULT 0,
    heat_allowance      DECIMAL(12,2) DEFAULT 0,
    other_allowance     DECIMAL(12,2) DEFAULT 0,
    security_bonus      DECIMAL(12,2) DEFAULT 0,
    cleaning_bonus      DECIMAL(12,2) DEFAULT 0,

    -- Calculated fields
    monthly_wage        DECIMAL(12,2),
    wage_subtotal       DECIMAL(12,2),
    personal_welfare    DECIMAL(12,2),
    company_welfare     DECIMAL(12,2),
    tax_amount          DECIMAL(12,2),
    net_pay             DECIMAL(12,2),
    total_cost          DECIMAL(12,2),

    -- Tax engine fields
    cumul_taxable_income DECIMAL(14,2),
    cumul_tax_paid       DECIMAL(14,2),
    tax_bracket_level    INT,

    -- Special deductions
    child_edu_deduct    DECIMAL(12,2) DEFAULT 0,
    mortgage_deduct     DECIMAL(12,2) DEFAULT 0,
    rent_deduct         DECIMAL(12,2) DEFAULT 0,
    elder_care_deduct   DECIMAL(12,2) DEFAULT 0,
    education_deduct    DECIMAL(12,2) DEFAULT 0,

    is_locked           BOOLEAN DEFAULT FALSE,
    locked_reason       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(employee_id, period)
);

-- ---------- social_policies ----------
CREATE TABLE IF NOT EXISTS social_policies (
    id                  BIGSERIAL PRIMARY KEY,
    company_code        VARCHAR(30) REFERENCES companies(code),
    effective_date      DATE         NOT NULL,
    pension_rate_p      DECIMAL(6,4),
    pension_rate_c      DECIMAL(6,4),
    medical_rate_p      DECIMAL(6,4),
    medical_rate_c      DECIMAL(6,4),
    medical_fixed_p     DECIMAL(8,2) DEFAULT 0,
    unemployment_rate_p DECIMAL(6,4),
    unemployment_rate_c DECIMAL(6,4),
    injury_rate_c       DECIMAL(6,4),
    maternity_rate_c    DECIMAL(6,4),
    housing_fund_rate_p DECIMAL(6,4),
    housing_fund_rate_c DECIMAL(6,4),
    supp_housing_rate_p DECIMAL(6,4) DEFAULT 0,
    rounding_method     VARCHAR(10) DEFAULT 'ROUND',
    is_active           BOOLEAN DEFAULT TRUE,
    UNIQUE(company_code, effective_date)
);

-- ---------- tax_brackets ----------
CREATE TABLE IF NOT EXISTS tax_brackets (
    level               INT PRIMARY KEY,
    min_income          DECIMAL(14,2),
    max_income          DECIMAL(14,2),
    rate                DECIMAL(5,4),
    quick_deduction     DECIMAL(12,2)
);

-- ---------- attendance_records ----------
CREATE TABLE IF NOT EXISTS attendance_records (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     BIGINT REFERENCES employees(id),
    period          VARCHAR(7) NOT NULL,
    sick_days       DECIMAL(5,1) DEFAULT 0,
    personal_days   DECIMAL(5,1) DEFAULT 0,
    annual_leave    DECIMAL(5,1) DEFAULT 0,
    overtime_days   DECIMAL(5,1) DEFAULT 0,
    adjustment_amount DECIMAL(12,2) DEFAULT 0,
    UNIQUE(employee_id, period)
);

-- ---------- audit_logs ----------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    table_name  VARCHAR(50) NOT NULL,
    record_id   BIGINT NOT NULL,
    action      VARCHAR(10) NOT NULL,
    user_id     UUID,
    before_val  JSONB,
    after_val   JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS Policies — enable on all tables
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- HR role: full access to all tables
CREATE POLICY hr_full_access_companies ON companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_employees ON employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_salary ON salary_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_social ON social_policies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_tax ON tax_brackets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_attendance ON attendance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_audit ON audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
