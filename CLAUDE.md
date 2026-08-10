# CLAUDE.md — Payroll Management System

> **Read this file FIRST.** It contains everything needed to bootstrap and develop this project end-to-end. This file is auto-loaded by Claude Code when opened in this directory.

---

## 1. Project Overview

**Web-based Payroll Management System** for the KaiYi Group (开弈集团) and all its subsidiary payroll entities. Replaces a 16-sheet Excel workbook with a proper web application.

**Core value:** What took 2-3 days of manual Excel work should take <30 minutes.

### Key Business Rules (NON-NEGOTIABLE)

1. **Three tax modes** — branch on `employees.tax_type`:
   - `normal` → Cumulative withholding method (七级累进, 3%-45%)
   - `service` → Lump-sum 20% on (wage - 800)
   - `non_taxable` → Zero tax (HK employees, etc.)

2. **Company names MUST use full legal names everywhere** (DB, UI, exports, API responses). Short names are ONLY for legacy Excel import compatibility. The canonical mapping lives in `company_mapping.json` (27 companies, version 2.1).

3. **Rounding rules vary by company** — Shanghai uses `ROUND`, Beijing 点才 uses `ROUNDUP`, Shenzhen keeps 1 decimal for housing fund. See §6.

4. **Disabled proxy employees** (代收代付残疾人) have fixed social base = 7460.

5. **Data source of truth** — `公司全称及关联信息表.xlsx` is the authoritative list of all companies. Any new company must be added there first, then synced to `company_mapping.json`.

---

## 2. Tech Stack (DECIDED — do not change without explicit approval)

| Layer | Technology |
|-------|-------------|
| Frontend | React 18 + TypeScript + Ant Design 5.x + AG Grid + ECharts |
| Backend | Python FastAPI + SQLAlchemy 2.0 + Pydantic v2 |
| Database | **Supabase (PostgreSQL 15)** — managed, with built-in Auth + RLS + Edge Functions |
| Cache / Queue | Redis 7 (Upstash, serverless) |
| File processing | openpyxl + pandas |
| Auth | Supabase Auth (JWT) + RBAC roles |
| Deployment | Vercel (frontend) + Supabase (backend/DB/Edge Functions) |
| CI/CD | **GitHub Actions** → auto deploy on push to `main` |
| Containerization | Docker (local dev only) |
| Hosting (alternative) | Fly.io for backend if not using Supabase Edge Functions |

---

## 3. Repository Structure

```
payroll-system/
├── .github/
│   └── workflows/
│       ├── ci.yml              # GitHub Actions: test → build → deploy
│       └── db-migrate.yml      # Auto-run Supabase migrations on merge
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPI entry point
│   │   ├── config.py         # Settings (env vars, Supabase URLs)
│   │   ├── deps.py           # DB session, auth dependencies
│   │   ├── models/           # SQLAlchemy ORM models
│   │   │   ├── company.py
│   │   │   ├── employee.py
│   │   │   ├── salary.py
│   │   │   ├── social_policy.py
│   │   │   ├── tax_bracket.py
│   │   │   ├── attendance.py
│   │   │   └── audit_log.py
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   │   ├── employee.py
│   │   │   ├── salary.py
│   │   │   └── report.py
│   │   ├── routers/          # API route handlers
│   │   │   ├── companies.py
│   │   │   ├── employees.py
│   │   │   ├── salary.py
│   │   │   ├── social.py
│   │   │   ├── attendance.py
│   │   │   ├── reports.py
│   │   │   └── auth.py
│   │   ├── services/         # Business logic
│   │   │   ├── calculator.py  # ★ CORE: all payroll formulas
│   │   │   ├── tax_engine.py
│   │   │   ├── social_engine.py
│   │   │   ├── attendance.py
│   │   │   └── excel_export.py
│   │   └── utils/
│   │       ├── encryption.py  # AES-256 for bank accounts, ID numbers
│   │       └── rounding.py    # ROUND/ROUNDUP/TRUNC helpers
│   ├── alembic/             # DB migrations
│   ├── tests/               # Unit + integration tests
│   │   ├── conftest.py
│   │   ├── test_calculator.py
│   │   ├── test_tax_engine.py
│   │   ├── test_social_engine.py
│   │   └── test_api.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── RosterTable.tsx
│   │   │   ├── SalaryWorkbench.tsx
│   │   │   ├── SocialConfig.tsx
│   │   │   ├── CompanySelector.tsx
│   │   │   └── ReportCenter.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Employees.tsx
│   │   │   ├── PayrollRun.tsx
│   │   │   └── Settings.tsx
│   │   ├── stores/          # Zustand stores
│   │   ├── api/             # Axios API client
│   │   ├── utils/
│   │   └── App.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── supabase/
│   ├── migrations/          # SQL migrations (RLS policies, etc.)
│   │   └── 20260810_init_schema.sql
│   ├── seed.sql             # Initial company data from company_mapping.json
│   ├── config.toml
│   └── functions/           # Supabase Edge Functions (optional)
│       └── payroll-calc/
│           └── index.ts
├── scripts/
│   ├── migrate_excel.py    # Import legacy Excel data
│   ├── seed_companies.py   # Load company_mapping.json → DB
│   └── verify_totals.py    # Validate calculated totals match Excel
├── company_mapping.json     # ★ Canonical company short→full name map (27 companies)
├── .env.example            # Template for environment variables
├── docker-compose.yml      # Local dev (Supabase via Docker)
└── README.md
```

---

## 4. Database Schema (Supabase PostgreSQL)

### 4.1 Companies Table (CRITICAL — load from `company_mapping.json`)

```sql
CREATE TABLE companies (
    code            VARCHAR(30)  PRIMARY KEY,
    full_name       VARCHAR(200) NOT NULL UNIQUE,
    short_name      VARCHAR(50)  NOT NULL,
    region          VARCHAR(20)  NOT NULL,       -- 上海/北京/天津/深圳/南京/香港
    category        VARCHAR(20),                 -- 人才系/投资系/香港系/其他
    social_policy   VARCHAR(30)  NOT NULL,      -- 上海标准/北京标准/天津标准/深圳标准/南京标准/不计税/无社保
    finance_contact VARCHAR(100),
    seal_person     VARCHAR(200),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed from company_mapping.json (27 companies)
-- See supabase/seed.sql for the full INSERT statements
```

### 4.2 Core Tables

**employees** — Roster, the input source for everything
```sql
CREATE TABLE employees (
    id                  BIGSERIAL PRIMARY KEY,
    employee_no         VARCHAR(30)  UNIQUE NOT NULL,
    name                VARCHAR(50)  NOT NULL,
    company_code        VARCHAR(30)  REFERENCES companies(code),
    company_full_name   VARCHAR(200) NOT NULL,  -- denormalized for display
    department          VARCHAR(100),
    position            VARCHAR(100),
    tax_type            VARCHAR(15)  NOT NULL DEFAULT 'normal',  -- normal/service/non_taxable
    social_status       VARCHAR(20)  NOT NULL DEFAULT '有社保',  -- 有社保/无社保/残疾人
    social_base         DECIMAL(12,2),
    housing_fund_base   DECIMAL(12,2),
    bank_account        BYTEA,        -- AES-256 encrypted
    id_number           BYTEA,        -- AES-256 encrypted
    join_date           DATE,
    leave_date          DATE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

**salary_records** — One row per employee per month
```sql
CREATE TABLE salary_records (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT REFERENCES employees(id),
    period              VARCHAR(7)   NOT NULL,  -- 'YYYY-MM'
    month_number        INT          NOT NULL,  -- 1-12, for tax calc
    
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
    monthly_wage        DECIMAL(12,2),   -- F1
    wage_subtotal       DECIMAL(12,2),   -- F2
    personal_welfare    DECIMAL(12,2),   -- F3 (sum of F4-F8)
    company_welfare     DECIMAL(12,2),   -- F17 (sum of F18-F24)
    tax_amount          DECIMAL(12,2),   -- F11/F14
    net_pay             DECIMAL(12,2),   -- F15
    total_cost          DECIMAL(12,2),   -- F25
    
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
```

**social_policies** — Rate configuration versioned by effective_date
```sql
CREATE TABLE social_policies (
    id                  BIGSERIAL PRIMARY KEY,
    company_code        VARCHAR(30) REFERENCES companies(code),
    effective_date      DATE         NOT NULL,
    pension_rate_p      DECIMAL(6,4),    -- 个人养老费率
    pension_rate_c      DECIMAL(6,4),    -- 公司养老费率
    medical_rate_p      DECIMAL(6,4),
    medical_rate_c      DECIMAL(6,4),
    medical_fixed_p     DECIMAL(8,2) DEFAULT 0,  -- 固定附加费(如3元)
    unemployment_rate_p DECIMAL(6,4),
    unemployment_rate_c DECIMAL(6,4),
    injury_rate_c       DECIMAL(6,4),
    maternity_rate_c    DECIMAL(6,4),
    housing_fund_rate_p DECIMAL(6,4),
    housing_fund_rate_c DECIMAL(6,4),
    supp_housing_rate_p DECIMAL(6,4) DEFAULT 0,
    rounding_method     VARCHAR(10) DEFAULT 'ROUND',  -- ROUND/ROUNDUP/TRUNC
    is_active           BOOLEAN DEFAULT TRUE,
    UNIQUE(company_code, effective_date)
);
```

**tax_brackets** — 7-level progressive tax table
```sql
CREATE TABLE tax_brackets (
    level               INT PRIMARY KEY,
    min_income          DECIMAL(14,2),
    max_income          DECIMAL(14,2),
    rate                DECIMAL(5,4),
    quick_deduction     DECIMAL(12,2)
);
-- Seed data:
-- Level 1: 0-36,000     3%   quick_deduction 0
-- Level 2: 36,000-144,000  10%  2520
-- Level 3: 144,000-300,000 20%  16920
-- Level 4: 300,000-420,000 25%  31920
-- Level 5: 420,000-660,000 30%  52920
-- Level 6: 660,000-960,000 35%  85920
-- Level 7: 960,000+        45%  181920
```

**attendance_records** — Daily leave/overtime data per employee per month
```sql
CREATE TABLE attendance_records (
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
```

**audit_logs** — JSONB before/after for every write
```sql
CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    table_name  VARCHAR(50) NOT NULL,
    record_id   BIGINT NOT NULL,
    action      VARCHAR(10) NOT NULL,  -- INSERT/UPDATE/DELETE
    user_id     UUID,
    before_val  JSONB,
    after_val   JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 Row Level Security (RLS)

Enable RLS on ALL tables. Policies:

```sql
-- HR role: full access
CREATE POLICY hr_full_access ON salary_records
    FOR ALL TO hr_role USING (true) WITH CHECK (true);

-- Manager: read-only own department
CREATE POLICY mgr_dept_read ON employees
    FOR SELECT TO manager_role
    USING (department = current_setting('app.current_dept'));

-- Employee: read-only own salary
CREATE POLICY emp_self_read ON salary_records
    FOR SELECT TO employee_role
    USING (employee_id = (SELECT id FROM employees WHERE auth_uid = auth.uid()));
```

---

## 5. Core Calculation Engine (`backend/app/services/calculator.py`)

This is the heart of the system. Implement these functions EXACTLY as specified.

### 5.1 Monthly Wage (F1)
```python
def calc_monthly_wage(base, allowance, attend_adj, comm_ins, kpi) -> Decimal:
    """本月工资 = 基本工资 + 补贴 + 考勤调整 + 商保 + KPI预提"""
    return round(base + allowance + attend_adj + comm_ins + kpi, 2)
```

### 5.2 Wage Subtotal (F2)
```python
def calc_wage_subtotal(monthly_wage, comm_office, perf, comm_apt,
                       heat_allow, allowance_other, sec_bonus, cln_bonus) -> Decimal:
    """薪资小计 = 本月工资 + 商办佣金 + 绩效 + 公寓佣金 + 防暑降温费 + 津贴 + 保安奖金 + 保洁奖金"""
    return round(monthly_wage + comm_office + perf + comm_apt +
                 heat_allow + allowance_other + sec_bonus + cln_bonus, 2)
```

### 5.3 Social Insurance — Personal (F4-F8)
```python
def calc_social_personal(emp, base_month):
    """计算个人五险一金，返回各险种金额和合计"""
    policy = get_policy(emp.company_code, base_month)
    base = get_social_base(emp.id, base_month)
    
    rounding_fn = get_rounding_fn(policy.rounding_method)
    
    pension_p  = rounding_fn(base.social_base * policy.pension_rate_p, 2)
    medical_p  = rounding_fn(base.social_base * policy.medical_rate_p + policy.medical_fixed_p, 2)
    unemp_p    = rounding_fn(base.social_base * policy.unemployment_rate_p, 2)
    housing_p  = rounding_fn(base.housing_fund_base * policy.housing_fund_rate_p, 2)
    supp_hsg_p = rounding_fn(base.housing_fund_base * policy.supp_housing_rate_p, 2) \
                 if policy.supp_housing_rate_p > 0 else Decimal('0')
    
    total_p = sum([pension_p, medical_p, unemp_p, housing_p, supp_hsg_p])
    return {
        'pension': pension_p, 'medical': medical_p, 'unemployment': unemp_p,
        'housing': housing_p, 'supp_housing': supp_hsg_p, 'total': total_p
    }
```

### 5.4 Social Insurance — Company (F18-F24)
```python
def calc_social_company(emp, base_month):
    """计算公司五险一金（养老/医疗/失业/工伤/生育/公积金）"""
    policy = get_policy(emp.company_code, base_month)
    base = get_social_base(emp.id, base_month)
    
    rounding_fn = get_rounding_fn(policy.rounding_method)
    
    pension_c    = rounding_fn(base.social_base * policy.pension_rate_c, 2)
    medical_c    = rounding_fn(base.social_base * policy.medical_rate_c, 2)
    unemp_c      = rounding_fn(base.social_base * policy.unemployment_rate_c, 2)
    injury_c     = rounding_fn(base.social_base * policy.injury_rate_c, 2)
    maternity_c  = rounding_fn(base.social_base * policy.maternity_rate_c, 2)
    housing_c    = rounding_fn(base.housing_fund_base * policy.housing_fund_rate_c, 2)
    
    total_c = sum([pension_c, medical_c, unemp_c, injury_c, maternity_c, housing_c])
    return {
        'pension': pension_c, 'medical': medical_c, 'unemployment': unemp_c,
        'injury': injury_c, 'maternity': maternity_c, 'housing': housing_c,
        'total': total_c
    }
```

### 5.5 Income Tax — Normal (F11-F13, cumulative withholding)
```python
def calc_income_tax_normal(emp, month, wage_subtotal, personal_welfare,
                           special_deductions, cumulative_data):
    """七级累进个税计算（累计预扣法）"""
    # Step 1: 当月应税
    cur_month_taxable = wage_subtotal - personal_welfare - special_deductions
    
    # Step 2: 累计收入
    cumul_income = cumulative_data.prev_cumul_taxable_income + cur_month_taxable
    
    # Step 3: 减除费用 (5000/月)
    exempt_total = Decimal('5000') * month
    
    # Step 4: 累计应纳税所得额
    taxable_income = max(cumul_income - exempt_total, Decimal('0'))
    
    # Step 5: 查七级税率表
    bracket = find_tax_bracket(taxable_income)
    cumul_tax = taxable_income * bracket.rate - bracket.quick_deduction
    
    # Step 6: 当月个税 = 累计应纳税额 - 已缴税额
    prev_tax_paid = cumulative_data.cumul_tax_paid
    monthly_tax = round(max(cumul_tax - prev_tax_paid, Decimal('0')), 2)
    
    return {
        'cumul_income': cumul_income,
        'taxable_income': taxable_income,
        'cumul_tax': cumul_tax,
        'monthly_tax': monthly_tax
    }
```

### 5.6 Income Tax — Service (F14, 劳务报酬)
```python
def calc_income_tax_service(emp, wage_subtotal):
    """劳务报酬个税: (薪资小计 - 800) × 20%"""
    if wage_subtotal <= 800:
        return Decimal('0')
    return round((wage_subtotal - 800) * Decimal('0.20'), 2)
```

### 5.7 Bank Payout (F15, 银行实发)
```python
def calc_bank_payout(subtotal, personal_welfare, monthly_tax,
                     tax_adj_neg=0, tax_adj_pos=0, off_book=0) -> Decimal:
    """银行实发 = 薪资小计 - 个人福利 - 个税 + 调整项"""
    return round(subtotal - personal_welfare - monthly_tax - tax_adj_neg + tax_adj_pos + off_book, 2)
```

### 5.8 Total Labor Cost (F25, 企业人力成本)
```python
def calc_total_labor_cost(subtotal, company_welfare, biz_ins=0,
                          birthday=0, health_fee=0, housing_allow=0,
                          provision_welfare=0, fuping=0) -> Decimal:
    """企业人力成本 = 薪资小计 + 公司福利 + 商保 + 生日费 + 体检费 + 住房补贴 + 福利费预提 + 扶贫"""
    return round(subtotal + company_welfare + biz_ins + birthday +
                 health_fee + housing_allow + provision_welfare + fuping, 2)
```

### 5.9 Attendance Adjustment
```python
def calc_attendance_adjust(base_salary, work_days, leave_data):
    """考勤调整: 病假扣50%, 事假扣100%, 加班补100%, 年假不扣"""
    daily_wage = base_salary / work_days  # default 21.75
    adjust = Decimal('0')
    adjust += leave_data.sick_days     * daily_wage * Decimal('-0.5')
    adjust += leave_data.personal_days * daily_wage * Decimal('-1.0')
    adjust += leave_data.overtime_days * daily_wage * Decimal('1.0')
    # 年假不扣款
    return round(adjust, 2)
```

### 5.10 Main Orchestrator
```python
class PayrollCalculator:
    """薪资计算主调度器"""
    
    def __init__(self, db_session, period: str):
        self.db = db_session
        self.period = period  # 'YYYY-MM'
        self.month_num = int(period.split('-')[1])  # 1-12

    async def run_full_cycle(self):
        """全量计算: 遍历所有在职员工"""
        employees = await self.get_active_employees()
        results = {'success': [], 'errors': []}
        for emp in employees:
            try:
                await self.process_employee(emp)
                results['success'].append(emp.id)
            except Exception as e:
                results['errors'].append({'emp_id': emp.id, 'error': str(e)})
        await self.generate_summary()
        return results

    async def process_employee(self, emp):
        """单员工完整计算流程"""
        # 1. 获取社保基数和费率
        base   = await self.get_social_base(emp.id, self.period)
        policy = await self.get_policy(emp.company_code, self.period)
        
        # 2. 计算社保
        social_p = self.calc_social_personal(emp, base, policy)
        social_c = self.calc_social_company(emp, base, policy)
        
        # 3. 获取工资数据
        wage_data = await self.get_wage_data(emp.id, self.period)
        
        # 4. 计算薪资小计
        subtotal = self.calc_wage_subtotal(wage_data)
        
        # 5. 计算个税
        if emp.tax_type == 'normal':
            cumul_data = await self.get_cumulative(emp.id, self.period)
            special_deduct = await self.get_special_deductions(emp.id, self.period)
            tax_result = self.calc_tax_normal(subtotal, social_p['total'], special_deduct, cumul_data)
        elif emp.tax_type == 'service':
            tax_result = {'monthly_tax': self.calc_tax_service(subtotal)}
        else:  # non_taxable
            tax_result = {'monthly_tax': Decimal('0')}
        
        # 6. 计算实发和总成本
        net  = self.calc_net_pay(subtotal, social_p['total'], tax_result['monthly_tax'])
        cost = self.calc_total_cost(subtotal, social_c['total'], wage_data)
        
        # 7. 保存
        await self.save_salary_record(emp.id, self.period, {
            'monthly_wage': wage_data.monthly_wage,
            'wage_subtotal': subtotal,
            'personal_welfare': social_p['total'],
            'company_welfare': social_c['total'],
            'tax_amount': tax_result['monthly_tax'],
            'net_pay': net,
            'total_cost': cost,
            **tax_result,
        })
```

---

## 6. Company-Specific Social Rates (2026)

| 公司全称 | 地区 | 养老p/c | 医疗p/c | 失业p/c | 工伤c | 生育c | 公积金p/c | 取整 |
|---------|------|---------|---------|---------|-------|-------|-----------|------|
| 开弈信息科技（中国）有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海开弈人才服务（集团）有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海开弈人力资源管理有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海开博人才服务有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海靠普人力资源管理有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海开弈投资管理有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海开弈企业服务外包有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海弈工分信息科技有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海弈工分健康信息咨询有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海弈工分文化体育发展有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海开弈医疗器械有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海开弈市场营销策划有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 智名信息技术（上海）有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海时代人才有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海朴素文化传播有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海开弈人力资源研究院 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海微芮洺信息科技有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海弈业信息技术有限公司 | 上海 | 8%/16% | 2%+3/9% | 0.5%/0.5% | 0.2% | 1% | 7%/7% | ROUND |
| 上海老龙馄饨有限公司 | 上海 | — | — | — | — | — | — | — |
| 北京开弈点才劳务服务有限公司 | 北京 | 8%/16% | 2%+3/9% | 0.5%/0.8% | 0.4% | — | 12%/12% | ROUNDUP |
| 开弈英才（天津）劳务服务有限公司 | 天津 | 8%/16% | 2%/10% | 0.5%/0.5% | 0.5% | 0.5% | 11%/11% | ROUND |
| 弈享（天津）共享经济信息咨询有限公司 | 天津 | 8%/16% | 2%/10% | 0.5%/0.5% | 0.5% | 0.5% | 11%/11% | ROUND |
| 深圳市和弈劳务派遣有限公司 | 深圳 | 8%/16% | 2%/5.2% | 0.3%/0.7% | 0.28% | 0.45% | 5%/5% | 1位小数(公积金) |
| 开弈信息技术（深圳）有限公司 | 深圳 | 8%/16% | 2%/5.2% | 0.3%/0.7% | 0.28% | 0.45% | 5%/5% | 1位小数(公积金) |
| 南京开弈人力资源管理有限公司 | 南京 | 8%/16% | 2%/8% | 0.5%/0.5% | 0.4% | 0.8% | 8%/8% | ROUND |
| 開弈（中國）人才服務有限公司 | 香港 | — | — | — | — | — | — | 不计税 |
| 中國時代開弈投資集團有限公司 | 香港 | — | — | — | — | — | — | 不计税 |

---

## 7. GitHub + Supabase Deployment (FULL SETUP)

### 7.1 Step 1: Create GitHub Repository

```bash
# Create repo (public or private)
gh repo create payroll-system --private --clone
cd payroll-system
git checkout -b develop

# Add remote
git remote add origin https://github.com/YOUR_ORG/payroll-system.git
```

### 7.2 Step 2: Create Supabase Project

1. Go to https://supabase.com → **New Project**
2. Choose organization → set project name: `payroll-system`
3. Set a strong database password (save it!)
4. Choose region closest to your users
5. Wait ~2 min for provisioning

### 7.3 Step 3: Install Supabase CLI & Link

```bash
# Install Supabase CLI
brew install supabase/tap/supabase   # macOS
# Windows: scoop install supabase
# Linux: npm install -g supabase

# Login
supabase login

# Initialize in project root
cd payroll-system
supabase init

# Link to remote project
supabase link --project-ref YOUR_PROJECT_REF
# Project ref found in: Settings → General → Reference ID
```

### 7.4 Step 4: Environment Variables (`.env`)

```env
# === Supabase ===
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
DATABASE_URL=postgresql://postgres:[password]@db.YOUR_PROJECT_REF.supabase.co:5432/postgres

# === Redis (Upstash) ===
REDIS_URL=redis://default:[password]@YOUR_UPSTASH_URL.upstash.io:6379

# === JWT ===
JWT_SECRET=your-32-byte-hex-secret-key-here

# === AES Encryption (bank accounts, ID numbers) ===
AES_KEY=your-32-byte-aes-key-here

# === Frontend (Vercel) ===
REACT_APP_API_URL=https://YOUR_PROJECT_REF.functions.supabase.co
REACT_APP_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 7.5 Step 5: Database Migration

```bash
# Option A: Using Supabase migrations (recommended)
supabase migration new init_payroll_schema
# Write SQL to supabase/migrations/20260810_init_payroll_schema.sql
supabase db push   # pushes to remote Supabase project

# Option B: Using Alembic (local dev)
cd backend
alembic init alembic
# Edit alembic.ini: sqlalchemy.url = $DATABASE_URL
alembic revision --autogenerate -m "init payroll schema"
alembic upgrade head

# Seed company data
cd ..
python scripts/seed_companies.py --env .env
```

### 7.6 Step 6: GitHub Actions CI/CD

The `.github/workflows/ci.yml` should:
1. **On PR to `main`**: Run backend tests (pytest + coverage), frontend lint + build
2. **On merge to `main`**: Deploy to Vercel + run Supabase migrations

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  # ========== BACKEND TESTS ==========
  backend-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: payroll_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: cd backend && pip install -r requirements.txt
      - run: cd backend && pytest tests/ -v --cov=app --cov-fail-under=90
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/payroll_test
      - run: cd backend && alembic upgrade head

  # ========== FRONTEND BUILD ==========
  frontend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd frontend && npm ci
      - run: cd frontend && npm run build
      - run: cd frontend && npm run lint

  # ========== DEPLOY ==========
  deploy:
    needs: [backend-test, frontend-test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Deploy Supabase migrations
      - name: Setup Supabase CLI
        run: npm install -g supabase
      - name: Deploy DB migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_TOKEN }}
          SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}

      # Deploy Frontend to Vercel
      - name: Deploy to Vercel
        run: |
          npm i -g vercel
          cd frontend
          vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
          vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
          vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### 7.7 Step 7: Vercel Frontend Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Link project (first time only)
cd frontend
vercel link
# Choose: Continue with Vercel → Your scope → Create new project

# Deploy
vercel --prod
```

Configure in Vercel dashboard:
- Framework preset: Create React App
- Build command: `npm run build`
- Output directory: `build`
- Environment variables: `REACT_APP_API_URL`, `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`

### 7.8 Step 8: Supabase Auth Setup

```sql
-- In Supabase SQL editor or via CLI
-- Enable auth providers
-- Settings → Authentication → Providers → enable Email (disable confirmations for internal use)

-- Create custom roles
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at) VALUES
('hr@kaiyi.com', crypt('initial-password', gen_salt('bf')), NOW());

-- Assign role
UPDATE auth.users SET raw_user_meta_data = '{"role": "hr_admin"}' WHERE email = 'hr@kaiyi.com';
```

### 7.9 Running Locally

```bash
# Terminal 1: Supabase local (Docker)
supabase start
# Note the local DB URL, anon key, service role key from output

# Terminal 2: Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env  # Edit with local Supabase credentials
uvicorn app.main:app --reload --port 8000

# Terminal 3: Frontend
cd frontend
npm install
npm start
# Opens http://localhost:3000

# Terminal 4: Redis (optional, for caching)
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

---

## 8. Development Phases

### Phase 0 — MVP (Weeks 1-4)
- [ ] Setup GitHub repo + Supabase project + CI/CD pipeline
- [ ] Define all SQL schemas + RLS policies
- [ ] Seed companies from `company_mapping.json` (27 companies)
- [ ] Employee CRUD + bulk import (company dropdown shows full names)
- [ ] Social policy config + base management UI
- [ ] **Core calculator engine** (all 10 functions in §5)
- [ ] Manual entry → auto-calculated net pay
- [ ] Basic Excel export (Salary Detail sheet)
- [ ] Supabase Auth + JWT + basic RLS

### Phase 1 — Full Features (Weeks 5-7)
- [ ] Service tax + non-taxable modes
- [ ] Annual cumulative tax auto-roll
- [ ] Attendance import + auto-calculation
- [ ] Performance/commission flexible entry
- [ ] Cost center / company summary reports
- [ ] Full Excel template export (all sheets matching original)
- [ ] Audit logging on all writes

### Phase 2 — Polish (Weeks 8-10)
- [ ] Payslip push (email / WeChat Work)
- [ ] Analytics dashboards (ECharts)
- [ ] Anomaly detection (>20% salary change alert)
- [ ] Historical data migration from Excel (150 employees × 12 months)
- [ ] Multi-dimensional salary comparison
- [ ] Company management UI (add/edit companies, sync to mapping JSON)

---

## 9. Testing Requirements

- **Unit tests**: Core calculator engine — minimum 90% coverage
- **Integration tests**: API endpoints with test database
- **Validation tests**: Migrated data must match Excel totals:
  - Total employees: ~150
  - June 2026 total payroll: ¥1,646,505.89
  - Per-employee variance: < ¥0.01
- **Run tests locally**: `cd backend && pytest tests/ -v --cov=app`
- **CI enforces**: `--cov-fail-under=90` — build fails below 90% coverage

---

## 10. Key Files to Read First

1. **`company_mapping.json`** — 27 companies, short→full name mapping (authoritative)
2. **`supabase/seed.sql`** — Initial company data + RLS policies
3. **`backend/app/services/calculator.py`** — Implement the 10 formulas here
4. **`.github/workflows/ci.yml`** — CI/CD pipeline (test → deploy)
5. **`scripts/seed_companies.py`** — Loads JSON mapping into Supabase

---

## 11. Critical Reminders

- 🔒 **Encrypt** bank_account and id_number at rest (AES-256)
- 🏢 **Always use full company names** in UI, exports, DB, API responses
- 📋 **`company_mapping.json` is the single source of truth** for company data
- 🔢 **Rounding matters** — different companies use different methods (see §6)
- 🔒 **RLS is mandatory** — every table, every query, no exceptions
- 📝 **Audit everything** — every write operation logs before/after JSONB
- 🚫 **Locked records are immutable** — require reason + approval to unlock
- ⚠️ **Disabled proxy employees** have fixed social base 7460
- 📊 **Excel export must match** the original template format exactly
- 🌐 **GitHub repo is the source of truth** — all code, configs, docs live there
- 🚀 **Supabase handles DB, Auth, Storage, Edge Functions** — don't provision separate services

---

## 12. Quick Start Commands

```bash
# === FIRST TIME SETUP ===
# 1. Clone and setup
git clone https://github.com/YOUR_ORG/payroll-system.git
cd payroll-system
cp .env.example .env  # Fill in your Supabase credentials

# 2. Start Supabase locally
supabase start

# 3. Setup backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m uvicorn app.main:app --reload

# 4. Setup frontend (new terminal)
cd frontend
npm install
npm start

# 5. Seed companies
cd ..
python scripts/seed_companies.py

# === DAILY WORKFLOW ===
# Pull latest
git pull origin develop

# Create feature branch
git checkout -b feature/calculator-fix

# Run tests before committing
cd backend && pytest tests/ -v

# Commit and push
git add .
git commit -m "feat: implement tax bracket logic"
git push origin feature/calculator-fix
# Then open PR on GitHub → auto-runs CI → merge to main → auto-deploys

# === DEPLOY ===
# Push to main triggers GitHub Actions → auto deploys to Vercel + Supabase
git push origin main
```

---

## 13. GitHub Repository Structure (final)

```
payroll-system/                    ← GitHub repo root
├── .github/workflows/ci.yml      ← CI/CD (GitHub Actions)
├── backend/                       ← FastAPI backend
├── frontend/                      ← React frontend
├── supabase/                      ← DB migrations + Edge Functions
├── scripts/                       ← Utility scripts
├── company_mapping.json           ← 27 companies (SOURCE OF TRUTH)
├── .env.example                   ← Env var template
├── docker-compose.yml            ← Local dev
├── CLAUDE.md                     ← THIS FILE (auto-loaded by Claude Code)
└── README.md
```

**Branch strategy:**
- `main` → production (auto-deploys via GitHub Actions)
- `develop` → staging (auto-deploys to preview)
- `feature/*` → feature branches (PR → develop)
- `hotfix/*` → urgent fixes (PR → main)
