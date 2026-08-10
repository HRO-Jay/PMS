/* 全局类型定义 */

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

export interface Employee {
  id: number;
  employee_no: string;
  name: string;
  company_code: string;
  company_full_name: string;
  department?: string;
  position?: string;
  tax_type: 'normal' | 'service' | 'non_taxable';
  social_status: '有社保' | '无社保' | '残疾人';
  social_base?: number;
  housing_fund_base?: number;
  join_date?: string;
  leave_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalaryRecord {
  id: number;
  employee_id: number;
  period: string;
  month_number: number;
  base_salary?: number;
  allowance?: number;
  attendance_adjust?: number;
  insurance_comm?: number;
  kpi_provision?: number;
  office_comm?: number;
  performance?: number;
  apartment_comm?: number;
  heat_allowance?: number;
  other_allowance?: number;
  security_bonus?: number;
  cleaning_bonus?: number;
  monthly_wage?: number;
  wage_subtotal?: number;
  personal_welfare?: number;
  company_welfare?: number;
  tax_amount?: number;
  net_pay?: number;
  total_cost?: number;
  cumul_taxable_income?: number;
  tax_bracket_level?: number;
  child_edu_deduct?: number;
  mortgage_deduct?: number;
  rent_deduct?: number;
  elder_care_deduct?: number;
  education_deduct?: number;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface SocialPolicy {
  id: number;
  company_code: string;
  effective_date: string;
  pension_rate_p: number;
  pension_rate_c: number;
  medical_rate_p: number;
  medical_rate_c: number;
  medical_fixed_p: number;
  unemployment_rate_p: number;
  unemployment_rate_c: number;
  injury_rate_c: number;
  maternity_rate_c: number;
  housing_fund_rate_p: number;
  housing_fund_rate_c: number;
  supp_housing_rate_p: number;
  rounding_method: 'ROUND' | 'ROUNDUP' | 'ROUND_1DEC';
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  employee_no: string;
  name: string;
  sick_days: number;
  personal_days: number;
  annual_leave: number;
  overtime_days: number;
  adjustment_amount: number;
}

export interface PayrollRunResponse {
  period: string;
  total_employees: number;
  success_count: number;
  error_count: number;
  errors: { emp_id: number; error: string }[];
  total_wages?: number;
  total_tax?: number;
  total_net_pay?: number;
  total_cost?: number;
}

export interface CompanySummaryItem {
  company_code: string;
  company_full_name: string;
  region: string;
  employee_count: number;
  total_wages: number;
  total_personal_welfare: number;
  total_company_welfare: number;
  total_tax: number;
  total_net_pay: number;
  total_cost: number;
}

export interface CompanySummaryReport {
  period: string;
  generated_at: string;
  companies: CompanySummaryItem[];
  grand_total_wages: number;
  grand_total_tax: number;
  grand_total_net_pay: number;
  grand_total_cost: number;
}
