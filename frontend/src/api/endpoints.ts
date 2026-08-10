import api from './client';
import type { Employee, SalaryRecord, PayrollRunResponse, Company, SocialPolicy, AttendanceRecord, CompanySummaryReport } from '../types';

/* ====== 公司 ====== */
export const fetchCompanies = () => api.get<{ total: number; companies: Company[] }>('/api/companies/');
export const fetchCompany = (code: string) => api.get<Company>(`/api/companies/${code}`);

/* ====== 员工 ====== */
export const fetchEmployees = (params?: { company_code?: string; tax_type?: string; is_active?: boolean; search?: string }) =>
  api.get<Employee[]>('/api/employees/', { params });
export const fetchEmployee = (id: number) => api.get<Employee>(`/api/employees/${id}`);
export const createEmployee = (data: Partial<Employee>) => api.post<Employee>('/api/employees/', data);
export const updateEmployee = (id: number, data: Partial<Employee>) => api.put<Employee>(`/api/employees/${id}`, data);
export const deleteEmployee = (id: number) => api.delete(`/api/employees/${id}`);

/* ====== 薪资 ====== */
export const fetchSalaryRecords = (period: string, company_code?: string) =>
  api.get<SalaryRecord[]>('/api/salary/records', { params: { period, company_code } });
export const runPayroll = (data: { period: string; employee_ids?: number[]; force_recalc?: boolean }) =>
  api.post<PayrollRunResponse>('/api/salary/run', data);
export const exportSalary = (period: string, company_code?: string) =>
  api.get(`/api/salary/export/${period}`, { params: { company_code }, responseType: 'blob' });

/* ====== 社保 ====== */
export const fetchSocialPolicies = (company_code?: string) =>
  api.get<{ total: number; policies: SocialPolicy[] }>('/api/social/policies', { params: { company_code } });
export const calcEmployeeSocial = (employee_id: number, period: string) =>
  api.get(`/api/social/calculate/${employee_id}`, { params: { period } });

/* ====== 考勤 ====== */
export const fetchAttendance = (period: string, employee_id?: number) =>
  api.get<{ period: string; total: number; records: AttendanceRecord[] }>('/api/attendance/', { params: { period, employee_id } });
export const upsertAttendance = (data: {
  employee_id: number; period: string; sick_days?: number; personal_days?: number;
  annual_leave?: number; overtime_days?: number; adjustment_amount?: number;
}) => api.post('/api/attendance/', data);

/* ====== 报表 ====== */
export const fetchCompanySummary = (period: string) =>
  api.get<CompanySummaryReport>(`/api/reports/company-summary/${period}`);
