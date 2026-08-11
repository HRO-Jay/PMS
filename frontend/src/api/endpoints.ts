import api from './client';

// Supabase 表名小写，用 PostgREST 查询语法
// select 用 * 返回所有列

/* ====== 公司 ====== */
export const fetchCompanies = () =>
  api.get('/companies?select=*&order=code').then(r => ({
    data: { total: r.data.length, companies: r.data }
  }));

/* ====== 员工 ====== */
export const fetchEmployees = (params?: { company_code?: string; is_active?: boolean; search?: string }) => {
  let query = '/employees?select=*';
  if (params?.company_code) query += `&company_code=eq.${params.company_code}`;
  if (params?.is_active !== undefined) query += `&is_active=eq.${params.is_active}`;
  if (params?.search) query += `&or=(name.ilike.*${params.search}*,employee_no.ilike.*${params.search}*)`;
  query += '&order=employee_no';
  return api.get(query);
};

export const createEmployee = (data: any) =>
  api.post('/employees', { ...data, is_active: true });
export const updateEmployee = (id: number, data: any) =>
  api.patch(`/employees?id=eq.${id}`, data);
export const deleteEmployee = (id: number) =>
  api.patch(`/employees?id=eq.${id}`, { is_active: false });

/* ====== 薪资 ====== */
export const fetchSalaryRecords = (period: string, company_code?: string) => {
  let query = '/salary_records?select=*';
  query += `&period=eq.${period}`;
  if (company_code) {
    // 需要 join employees 表
    return api.get(`/salary_records?select=*,employees!inner(company_code)&period=eq.${period}&employees.company_code=eq.${company_code}`)
      .then(r => ({ data: r.data }));
  }
  return api.get(query);
};

export const runPayroll = (data: { period: string; force_recalc?: boolean }) =>
  api.post('/rpc/run_payroll_cycle', { p_period: data.period });

export const exportSalary = (period: string, company_code?: string) =>
  Promise.resolve({ data: new Blob() }); // placeholder

/* ====== 社保 ====== */
export const fetchSocialPolicies = (company_code?: string) => {
  let query = '/social_policies?select=*&order=company_code';
  if (company_code) query += `&company_code=eq.${company_code}`;
  return api.get(query).then(r => ({
    data: { total: r.data.length, policies: r.data }
  }));
};

/* ====== 考勤 ====== */
export const fetchAttendance = (period: string, employee_id?: number) => {
  let query = `/attendance_records?select=*,employees!inner(employee_no,name)&period=eq.${period}`;
  if (employee_id) query += `&employee_id=eq.${employee_id}`;
  return api.get(query).then(r => ({
    data: {
      period,
      total: r.data.length,
      records: r.data.map((rec: any) => ({
        ...rec,
        employee_no: rec.employees?.employee_no || '',
        name: rec.employees?.name || '',
      }))
    }
  }));
};

export const upsertAttendance = (data: {
  employee_id: number; period: string; sick_days?: number; personal_days?: number;
  annual_leave?: number; overtime_days?: number; adjustment_amount?: number;
}) => api.post('/attendance_records', data);

/* ====== 报表 ====== */
export const fetchCompanySummary = (period: string) =>
  api.get(`/salary_records?select=employees(company_code,companies(full_name,region)),wage_subtotal,personal_welfare,company_welfare,tax_amount,net_pay,total_cost&period=eq.${period}`)
    .then(r => {
      // Aggregate by company from flat records
      const byCompany: Record<string, any> = {};
      r.data.forEach((rec: any) => {
        const c = rec.employees?.companies;
        if (!c) return;
        const code = rec.employees.company_code;
        if (!byCompany[code]) {
          byCompany[code] = {
            company_code: code,
            company_full_name: c.full_name,
            region: c.region,
            employee_count: 0,
            total_wages: 0, total_personal_welfare: 0, total_company_welfare: 0,
            total_tax: 0, total_net_pay: 0, total_cost: 0,
          };
        }
        const agg = byCompany[code];
        agg.employee_count++;
        agg.total_wages += rec.wage_subtotal || 0;
        agg.total_personal_welfare += rec.personal_welfare || 0;
        agg.total_company_welfare += rec.company_welfare || 0;
        agg.total_tax += rec.tax_amount || 0;
        agg.total_net_pay += rec.net_pay || 0;
        agg.total_cost += rec.total_cost || 0;
      });
      const companies = Object.values(byCompany);
      return {
        data: {
          period,
          generated_at: new Date().toISOString(),
          companies,
          grand_total_wages: companies.reduce((s: number, c: any) => s + c.total_wages, 0),
          grand_total_tax: companies.reduce((s: number, c: any) => s + c.total_tax, 0),
          grand_total_net_pay: companies.reduce((s: number, c: any) => s + c.total_net_pay, 0),
          grand_total_cost: companies.reduce((s: number, c: any) => s + c.total_cost, 0),
        }
      };
    });
