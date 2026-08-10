-- ============================================================
--  payroll-system — 一键初始化脚本
--  在 Supabase SQL Editor 中粘贴，全选，点 Run
--  https://supabase.com/dashboard/project/avuldnywmiflbmmlgmas/sql
-- ============================================================

-- ============================================================
-- PART 1: 建表 (7 张表)
-- ============================================================

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

CREATE TABLE IF NOT EXISTS salary_records (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT REFERENCES employees(id),
    period              VARCHAR(7)   NOT NULL,
    month_number        INT          NOT NULL,
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
    monthly_wage        DECIMAL(12,2),
    wage_subtotal       DECIMAL(12,2),
    personal_welfare    DECIMAL(12,2),
    company_welfare     DECIMAL(12,2),
    tax_amount          DECIMAL(12,2),
    net_pay             DECIMAL(12,2),
    total_cost          DECIMAL(12,2),
    cumul_taxable_income DECIMAL(14,2),
    cumul_tax_paid       DECIMAL(14,2),
    tax_bracket_level    INT,
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

CREATE TABLE IF NOT EXISTS tax_brackets (
    level               INT PRIMARY KEY,
    min_income          DECIMAL(14,2),
    max_income          DECIMAL(14,2),
    rate                DECIMAL(5,4),
    quick_deduction     DECIMAL(12,2)
);

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
-- PART 2: RLS (行级安全)
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_full_access_companies ON companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_employees ON employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_salary ON salary_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_social ON social_policies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_tax ON tax_brackets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_attendance ON attendance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hr_full_access_audit ON audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- PART 3: 种子数据 — 27 家公司
-- ============================================================
INSERT INTO companies (code, full_name, short_name, region, category, social_policy, finance_contact, seal_person) VALUES
  ('KAIYI_CHINA',         '開弈（中國）人才服務有限公司',     '开弈中国',   '香港', '香港系', '不计税',     '张毅-抄送安子玥', NULL),
  ('KAIYI_ERA_INVEST',   '中國時代開弈投資集團有限公司',   '时代开弈',   '香港', '香港系', '不计税',     NULL,              NULL),
  ('KAIYI_INFO',          '开弈信息科技（中国）有限公司',    '开弈信息',   '上海', '信息系', '上海标准',   '蔡',              '张毅-抄送安子玥'),
  ('KAIYI_TALENT',        '上海开弈人才服务（集团）有限公司', '开弈人才',   '上海', '人才系', '上海标准',   'Angela',          '张毅-抄送安子玥'),
  ('KAIYI_HR',            '上海开弈人力资源管理有限公司',     '开弈人力',   '上海', '人才系', '上海标准',   '蔡',              NULL),
  ('KAIBO_TALENT',        '上海开博人才服务有限公司',       '开博人才',   '上海', '人才系', '上海标准',   '蔡',              NULL),
  ('KAOPU_HR',            '上海靠普人力资源管理有限公司',     '靠普人力',   '上海', '人才系', '上海标准',   '蔡',              NULL),
  ('KAIYI_INVEST',        '上海开弈投资管理有限公司',       '开弈投资',   '上海', '投资系', '上海标准',   '刘',              '张毅-抄送安子玥'),
  ('KAIYI_OUTSOURCING',   '上海开弈企业服务外包有限公司',    '开弈外包',   '上海', '人才系', '上海标准',   '蔡',              NULL),
  ('KAIYI_MEDICAL',       '上海开弈医疗器械有限公司',       '开弈医疗',   '上海', '其他',   '上海标准',   NULL,              NULL),
  ('KAIYI_MARKETING',     '上海开弈市场营销策划有限公司',    '开弈市场营销','上海', '其他',   '上海标准',   NULL,              NULL),
  ('YIGONGFEN_INFO',      '上海弈工分信息科技有限公司',      '弈工分信息', '上海', '投资系', '上海标准',   '刘',              NULL),
  ('YIGONGFEN_HEALTH',    '上海弈工分健康信息咨询有限公司',  '弈工分健康', '上海', '投资系', '上海标准',   'Angela',          NULL),
  ('ZHIMING_INFO',         '智名信息技术（上海）有限公司',    '智名',      '上海', '其他',   '上海标准',   '刘',              NULL),
  ('YIGONGFEN_CULTURE',   '上海弈工分文化体育发展有限公司',  '弈工分文化', '上海', '投资系', '上海标准',   'Angela',          NULL),
  ('TIANJIN_YINGCAI',     '开弈英才（天津）劳务服务有限公司','天津英才',   '天津', '人才系', '天津标准',   NULL,              NULL),
  ('YIXIANG_TIANJIN',     '弈享（天津）共享经济信息咨询有限公司','弈享天津', '天津', '人才系', '天津标准',   '蔡',              NULL),
  ('SHENZHEN_HEYI',       '深圳市和弈劳务派遣有限公司',     '深圳和弈',   '深圳', '人才系', '深圳标准',   '蔡',              NULL),
  ('KAIYI_INFO_SZ',       '开弈信息技术（深圳）有限公司',   '深圳开弈信息','深圳', '其他',   '深圳标准',   NULL,              NULL),
  ('NANJING_KAIYI_HR',    '南京开弈人力资源管理有限公司',    '南京开弈人力','南京', '人才系', '南京标准',   '蔡',              NULL),
  ('BEIJING_DIANCAI',     '北京开弈点才劳务服务有限公司',    '北京点才',   '北京', '人才系', '北京标准',   '蔡',              NULL),
  ('SHIDAI_TALENT',       '上海时代人才有限公司',          '时代人才',   '上海', '其他',   '上海标准',   NULL,              NULL),
  ('PUSU_CULTURE',        '上海朴素文化传播有限公司',       '朴素文化',   '上海', '其他',   '上海标准',   NULL,              NULL),
  ('KAIYI_HR_RESEARCH',   '上海开弈人力资源研究院',        '开弈人力资源','上海', '其他',   '上海标准',   NULL,              NULL),
  ('WEIRUIMING',          '上海微芮洺信息科技有限公司',     '微芮洺',    '上海', '其他',   '上海标准',   'Angela',          NULL),
  ('YIYE_INFO',           '上海弈业信息技术有限公司',       '弈业信息',   '上海', '其他',   '上海标准',   NULL,              NULL),
  ('LAOLONG_HUNTUN',      '上海老龙馄饨有限公司',          '老龙馄饨',   '上海', '其他',   '无社保',     'Angela',          NULL)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- PART 4: 种子数据 — 社保费率 (五地)
-- ============================================================

-- 上海标准 (18家公司)
INSERT INTO social_policies (company_code, effective_date, pension_rate_p, pension_rate_c, medical_rate_p, medical_rate_c, medical_fixed_p, unemployment_rate_p, unemployment_rate_c, injury_rate_c, maternity_rate_c, housing_fund_rate_p, housing_fund_rate_c, supp_housing_rate_p, rounding_method) VALUES
  ('KAIYI_INFO',        '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('KAIYI_TALENT',      '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('KAIYI_HR',          '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('KAIBO_TALENT',      '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('KAOPU_HR',          '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('KAIYI_INVEST',      '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('KAIYI_OUTSOURCING', '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('KAIYI_MEDICAL',     '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('KAIYI_MARKETING',   '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('YIGONGFEN_INFO',    '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('YIGONGFEN_HEALTH',  '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('ZHIMING_INFO',      '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('YIGONGFEN_CULTURE', '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('SHIDAI_TALENT',     '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('PUSU_CULTURE',      '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('KAIYI_HR_RESEARCH', '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('WEIRUIMING',        '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND'),
  ('YIYE_INFO',         '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.005, 0.002, 0.01, 0.07, 0.07, 0, 'ROUND')
ON CONFLICT (company_code, effective_date) DO NOTHING;

-- 北京标准 (ROUNDUP)
INSERT INTO social_policies (company_code, effective_date, pension_rate_p, pension_rate_c, medical_rate_p, medical_rate_c, medical_fixed_p, unemployment_rate_p, unemployment_rate_c, injury_rate_c, maternity_rate_c, housing_fund_rate_p, housing_fund_rate_c, supp_housing_rate_p, rounding_method) VALUES
  ('BEIJING_DIANCAI',   '2026-01-01', 0.08, 0.16, 0.02, 0.09, 3, 0.005, 0.008, 0.004, 0,    0.12, 0.12, 0, 'ROUNDUP')
ON CONFLICT (company_code, effective_date) DO NOTHING;

-- 天津标准
INSERT INTO social_policies (company_code, effective_date, pension_rate_p, pension_rate_c, medical_rate_p, medical_rate_c, medical_fixed_p, unemployment_rate_p, unemployment_rate_c, injury_rate_c, maternity_rate_c, housing_fund_rate_p, housing_fund_rate_c, supp_housing_rate_p, rounding_method) VALUES
  ('TIANJIN_YINGCAI',   '2026-01-01', 0.08, 0.16, 0.02, 0.10, 0, 0.005, 0.005, 0.005, 0.005, 0.11, 0.11, 0, 'ROUND'),
  ('YIXIANG_TIANJIN',   '2026-01-01', 0.08, 0.16, 0.02, 0.10, 0, 0.005, 0.005, 0.005, 0.005, 0.11, 0.11, 0, 'ROUND')
ON CONFLICT (company_code, effective_date) DO NOTHING;

-- 深圳标准 (公积金1位小数)
INSERT INTO social_policies (company_code, effective_date, pension_rate_p, pension_rate_c, medical_rate_p, medical_rate_c, medical_fixed_p, unemployment_rate_p, unemployment_rate_c, injury_rate_c, maternity_rate_c, housing_fund_rate_p, housing_fund_rate_c, supp_housing_rate_p, rounding_method) VALUES
  ('SHENZHEN_HEYI',     '2026-01-01', 0.08, 0.16, 0.02, 0.052, 0, 0.003, 0.007, 0.0028, 0.0045, 0.05, 0.05, 0, 'ROUND_1DEC'),
  ('KAIYI_INFO_SZ',     '2026-01-01', 0.08, 0.16, 0.02, 0.052, 0, 0.003, 0.007, 0.0028, 0.0045, 0.05, 0.05, 0, 'ROUND_1DEC')
ON CONFLICT (company_code, effective_date) DO NOTHING;

-- 南京标准
INSERT INTO social_policies (company_code, effective_date, pension_rate_p, pension_rate_c, medical_rate_p, medical_rate_c, medical_fixed_p, unemployment_rate_p, unemployment_rate_c, injury_rate_c, maternity_rate_c, housing_fund_rate_p, housing_fund_rate_c, supp_housing_rate_p, rounding_method) VALUES
  ('NANJING_KAIYI_HR',  '2026-01-01', 0.08, 0.16, 0.02, 0.08, 0, 0.005, 0.005, 0.004, 0.008, 0.08, 0.08, 0, 'ROUND')
ON CONFLICT (company_code, effective_date) DO NOTHING;

-- ============================================================
-- PART 5: 种子数据 — 七级个税税率表
-- ============================================================
INSERT INTO tax_brackets (level, min_income, max_income, rate, quick_deduction) VALUES
  (1,        0,   36000,   0.03,     0),
  (2,    36000,  144000,   0.10,  2520),
  (3,   144000,  300000,   0.20, 16920),
  (4,   300000,  420000,   0.25, 31920),
  (5,   420000,  660000,   0.30, 52920),
  (6,   660000,  960000,   0.35, 85920),
  (7,   960000, 99999999,  0.45, 181920)
ON CONFLICT (level) DO NOTHING;

-- ============================================================
-- 验证
-- ============================================================
SELECT 'companies' as table_name, COUNT(*) as row_count FROM companies
UNION ALL
SELECT 'social_policies', COUNT(*) FROM social_policies
UNION ALL
SELECT 'tax_brackets', COUNT(*) FROM tax_brackets;
