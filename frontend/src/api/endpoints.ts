import api from './client';

// ====== 公司 ======
export const fetchCompanies = () =>
  api.get('/companies?select=code,full_name,short_name,region&order=code&is_active=eq.true').then(r => ({
    data: { total: r.data.length, companies: r.data }
  }));

// ====== 员工花名册 ======
export const fetchEmployees = (params?: { company_code?: string; is_active?: boolean; search?: string }) => {
  let query = '/employees?select=*';
  if (params?.company_code) query += `&company_code=eq.${params.company_code}`;
  if (params?.is_active !== undefined) query += `&is_active=eq.${params.is_active}`;
  if (params?.search) query += `&or=(name.ilike.*${params.search}*)`;
  query += '&order=name';
  return api.get(query);
};

export const createEmployee = (data: any) =>
  api.post('/employees', { ...data, is_active: true });

export const updateEmployee = (id: number, data: any) =>
  api.patch(`/employees?id=eq.${id}`, data);

export const deleteEmployee = (id: number) =>
  api.patch(`/employees?id=eq.${id}`, { is_active: false });

// ====== 福利套 ======
export const fetchWelfareSets = () =>
  api.get('/welfare_sets?select=*&order=name');

// ====== 社保记录 ======
export const fetchSocialRecords = (period: string) =>
  api.get(`/social_records?select=*&period=eq.${period}&order=unique_hash`);

// ====== 考勤记录 ======
export const fetchAttendanceRecords = (period: string) =>
  api.get(`/attendance_records?select=*&period=eq.${period}&order=unique_hash`);

export const upsertAttendance = (data: any) =>
  api.post('/attendance_records', data);

// ====== 薪资记录 ======
export const fetchSalaryRecords = (period: string) =>
  api.get(`/salary_records?select=*&period=eq.${period}&order=unique_hash`);

// ====== 报表/数据总览 ======
export const fetchCompanySummary = (period: string) =>
  api.get(`/salary_records?select=wage_subtotal,net_pay,total_cost,unique_hash&period=eq.${period}`)
    .then(r => {
      // Flat summary — just return the data for now, dashboard will aggregate
      const records = r.data;
      const totalWages = records.reduce((s: number, rec: any) => s + (rec.wage_subtotal || 0), 0);
      const totalNetPay = records.reduce((s: number, rec: any) => s + (rec.net_pay || 0), 0);
      const totalCost = records.reduce((s: number, rec: any) => s + (rec.total_cost || 0), 0);
      return {
        data: {
          period,
          employee_count: records.length,
          total_wages: totalWages,
          total_net_pay: totalNetPay,
          total_cost: totalCost,
        }
      };
    });
