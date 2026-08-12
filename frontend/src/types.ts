/* 全局类型定义 — v2 */

export interface Company {
  code: string;
  full_name: string;
  short_name: string;
  region: string;
  category: string;
  social_policy: string;
  finance_contact?: string;
  seal_person?: string;
  is_active: boolean;
}

// ====== 员工花名册 ======
export interface Employee {
  id: number;
  unique_hash: string;
  name: string;
  company_code: string;
  company_full_name: string;
  cost_center?: string;
  department?: string;
  reporter?: string;
  position?: string;
  join_date?: string;
  work_schedule: string;
  tax_type: 'normal' | 'service' | 'non_taxable';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ====== 社保管理 ======
export interface SocialRecord {
  id: number;
  unique_hash: string;
  period: string;
  welfare_set: string;
  social_base?: number;
  housing_fund_base?: number;
  // 个人
  pension_p?: number;
  medical_p?: number;
  unemployment_p?: number;
  housing_fund_p?: number;
  supp_housing_p?: number;
  // 公司
  pension_c?: number;
  medical_c?: number;
  unemployment_c?: number;
  injury_c?: number;
  maternity_c?: number;
  housing_fund_c?: number;
  supp_housing_c?: number;
  created_at: string;
  updated_at: string;
}

// ====== 福利套设置 ======
export interface WelfareSet {
  id: number;
  name: string;
  region: string;
  description?: string;
  // 个人费率
  pension_rate_p: number;
  medical_rate_p: number;
  medical_fixed_p: number;
  unemployment_rate_p: number;
  housing_fund_rate_p: number;
  supp_housing_rate_p: number;
  // 公司费率
  pension_rate_c: number;
  medical_rate_c: number;
  unemployment_rate_c: number;
  injury_rate_c: number;
  maternity_rate_c: number;
  housing_fund_rate_c: number;
  supp_housing_rate_c: number;
  rounding_method: 'ROUND' | 'ROUNDUP' | 'ROUND_1DEC';
  is_active: boolean;
}

// ====== 考勤管理 ======
export interface AttendanceRecord {
  id: number;
  unique_hash: string;
  period: string;
  employee_no: string;
  name: string;
  sick_days: number;
  sick_adjust: number;
  personal_days: number;
  personal_adjust: number;
  annual_leave: number;
  compensatory_leave: number;
  absenteeism_days: number;
  funeral_leave: number;
  parental_leave: number;
  marriage_leave: number;
  maternity_leave: number;
  overtime_days: number;
  on_off_adjust: number;
}

// ====== 薪资计算 ======
export interface SalaryRecord {
  id: number;
  unique_hash: string;
  period: string;
  month_number: number;
  // 收入项
  base_salary?: number;
  allowance_supp?: number;
  attendance_adjust?: number;
  other_adjust?: number;
  insurance_amount?: number;
  kpi_provision?: number;
  monthly_wage?: number;
  office_comm?: number;
  performance_pay?: number;
  apartment_comm?: number;
  talent_kpi?: number;
  heat_allowance?: number;
  other_allowance?: number;
  security_bonus?: number;
  cleaning_bonus?: number;
  wage_subtotal?: number;
  // 社保基数
  social_base?: number;
  housing_fund_base?: number;
  // 个人福利
  pension_p?: number;
  medical_p?: number;
  unemployment_p?: number;
  housing_fund_p?: number;
  supp_housing_p?: number;
  // 隐藏 — 专项扣除
  cumul_child_edu?: number;
  cumul_mortgage?: number;
  cumul_rent?: number;
  cumul_elder_care?: number;
  cumul_continuing_edu?: number;
  // 隐藏 — 个税中间值
  month_taxable_wage?: number;
  cumul_income?: number;
  taxable_income?: number;
  cumul_tax_paid?: number;
  // 当月个税
  monthly_tax?: number;
  insurance_adjust?: number;
  net_pay?: number;
  // 公司福利
  pension_c?: number;
  medical_c?: number;
  unemployment_c?: number;
  injury_c?: number;
  maternity_c?: number;
  housing_fund_c?: number;
  supp_housing_c?: number;
  // 企业成本
  total_cost?: number;
  provision_welfare?: number;
  is_locked: boolean;
}
