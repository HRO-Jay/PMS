import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Space, message, Input, Tag } from 'antd';
import { CalculatorOutlined, LinkOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { calcIncomeTax } from '../../utils/taxCalc';
import { withSource } from '../../components/SourceTag';

/**
 * 个税扣缴 — Tab 3：月度计算（累计预扣法）
 * 6月起每月一行，输出「当月个人所得税」联动薪酬板块
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const TaxMonthlyCalcPage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 并行加载：员工、期初累计数、专项附加、上月专项附加、上月计算、当月计算、社保个人福利、薪酬本期收入
      const [empRes, openingRes, specialRes, prevSpecialRes, prevCalcRes, calcRes, welfareRes, salaryRes] = await Promise.all([
        api.get('/employees?select=unique_hash,name,status,pay_company,cost_center,department,report_to,position,entry_date,attendance_type'),
        api.get('/tax_opening_balances?select=*'),
        api.get(`/tax_special_deductions?select=*&period=eq.${period}`),
        api.get(`/tax_special_deductions?select=*&period=eq.${prevPeriod(period)}`),
        api.get(`/tax_monthly_calcs?select=*&period=eq.${prevPeriod(period)}`),
        api.get(`/tax_monthly_calcs?select=*&period=eq.${period}`),
        api.get(`/employee_welfare_records?select=unique_hash,personal_total&period=eq.${period}`),
        api.get(`/salary_records?select=unique_hash,wage_subtotal&period=eq.${period}`),
      ]);

      const empList: any[] = empRes.data;
      const openingMap: Record<string, any> = {};
      openingRes.data.forEach((r: any) => { openingMap[r.unique_hash] = r; });
      const specialMap: Record<string, any> = {};
      specialRes.data.forEach((r: any) => { specialMap[r.unique_hash] = r; });
      const prevSpecialMap: Record<string, any> = {};
      prevSpecialRes.data.forEach((r: any) => { prevSpecialMap[r.unique_hash] = r; });
      const prevMap: Record<string, any> = {};
      prevCalcRes.data.forEach((r: any) => { prevMap[r.unique_hash] = r; });
      const calcMap: Record<string, any> = {};
      calcRes.data.forEach((r: any) => { calcMap[r.unique_hash] = r; });
      const welfareMap: Record<string, any> = {};
      welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });
      const salaryMap: Record<string, any> = {};
      salaryRes.data.forEach((r: any) => { salaryMap[r.unique_hash] = r; });

      const merged = empList
        .filter((e: any) => e.status === '在职' || calcMap[e.unique_hash])
        .map((e: any) => {
          const opening = openingMap[e.unique_hash] || {};
          const special = specialMap[e.unique_hash] || {};
          const prevSpecial = prevSpecialMap[e.unique_hash] || {};
          const prev = prevMap[e.unique_hash] || {};
          const calc = calcMap[e.unique_hash] || {};
          // 本期数
          const currentTaxableIncome = Number(salaryMap[e.unique_hash]?.wage_subtotal || 0);
          const currentFiveInsurance = Number(welfareMap[e.unique_hash]?.personal_total || 0);
          // 本期专项附加 = 本月累计 - 上月累计
          const specialTotal = (special.cumul_child_edu || 0) + (special.cumul_continuing_edu || 0) + (special.cumul_mortgage || 0) + (special.cumul_rent || 0) + (special.cumul_elder_care || 0) + (special.cumul_infant_care || 0);
          const prevSpecialTotal = (prevSpecial.cumul_child_edu || 0) + (prevSpecial.cumul_continuing_edu || 0) + (prevSpecial.cumul_mortgage || 0) + (prevSpecial.cumul_rent || 0) + (prevSpecial.cumul_elder_care || 0) + (prevSpecial.cumul_infant_care || 0);
          const currentSpecialDeduct = Math.max(0, Number((specialTotal - prevSpecialTotal).toFixed(2)));
          // 本期其他扣除 = 本月累计(其他扣除项合计) - 上月累计
          const otherTotal = (special.cumul_pension || 0) + (special.cumul_annuity || 0) + (special.cumul_health_ins || 0) + (special.cumul_tax_defer_ins || 0) + (special.cumul_donation || 0);
          const prevOtherTotal = (prevSpecial.cumul_pension || 0) + (prevSpecial.cumul_annuity || 0) + (prevSpecial.cumul_health_ins || 0) + (prevSpecial.cumul_tax_defer_ins || 0) + (prevSpecial.cumul_donation || 0);
          const currentOtherDeduct = Math.max(0, Number((otherTotal - prevOtherTotal).toFixed(2)));
          // 本期减免税额 = 本月累计减免 - 上月累计减免
          const currentTaxRelief = Math.max(0, Number(((special.tax_relief || 0) - (prevSpecial.tax_relief || 0)).toFixed(2)));

          return {
            key: calc.id ?? `emp-${e.unique_hash}`,
            unique_hash: e.unique_hash,
            employee_name: e.name,
            pay_company: e.pay_company || '',
            cost_center: e.cost_center || '',
            department: e.department || '',
            report_to: e.report_to || '',
            position: e.position || '',
            entry_date: e.entry_date || '',
            attendance_type: e.attendance_type || '',
            // 本期
            current_taxable_income: currentTaxableIncome,
            current_five_insurance: currentFiveInsurance,
            current_special_deduct: currentSpecialDeduct,
            current_other_deduct: currentOtherDeduct,
            current_tax_relief: currentTaxRelief,
            // 已有计算结果
            ...calc,
            // 期初（6月用）
            opening: opening,
            // 上月累计
            prev: prev,
            // 本月专项附加完整字段（供计算用）
            special: special,
            employed_months: opening.employed_months || 5,
          };
        });

      setRecords(merged);
    } catch { message.error('加载个税计算数据失败'); }
    finally { setLoading(false); }
  };

  // 计算上一个月
  function prevPeriod(p: string): string {
    const [y, m] = p.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }

  // 执行当月计算
  const handleCalc = async () => {
    let success = 0;
    for (const r of records) {
      try {
        const opening = r.opening || {};
        const prev = r.prev || {};
        const isFirstMonth = period === '2026-06'; // 6月首个计算月
        const monthNum = parseInt(period.split('-')[1]);

        // 累计数
        const cumulTaxableIncome = isFirstMonth
          ? Number(opening.cumul_income || 0) + Number(r.current_taxable_income || 0)
          : Number(prev.cumul_taxable_income || 0) + Number(r.current_taxable_income || 0);
        const cumulFiveInsurance = isFirstMonth
          ? Number(opening.cumul_five_insurance || 0) + Number(r.current_five_insurance || 0)
          : Number(prev.cumul_five_insurance || 0) + Number(r.current_five_insurance || 0);
        // 累计专项附加：直接取报税系统累计值
        const specialTotal = (r.special?.cumul_child_edu || 0) + (r.special?.cumul_continuing_edu || 0) + (r.special?.cumul_mortgage || 0) + (r.special?.cumul_rent || 0) + (r.special?.cumul_elder_care || 0) + (r.special?.cumul_infant_care || 0);
        const cumulSpecialDeduct = specialTotal;
        // 累计其他扣除：本月累计（年金+个人养老金+商业健康险+税延养老+捐赠）
        const otherTotal = (r.special?.cumul_pension || 0) + (r.special?.cumul_annuity || 0) + (r.special?.cumul_health_ins || 0) + (r.special?.cumul_tax_defer_ins || 0) + (r.special?.cumul_donation || 0);
        const cumulOtherDeduct = isFirstMonth
          ? Number(opening.cumul_other_deduction || 0) + Number(r.current_other_deduct || 0)
          : otherTotal;
        // 累计减免税额：本月累计减免
        const cumulTaxRelief = isFirstMonth
          ? Number(opening.cumul_tax_relief || 0) + Number(r.current_tax_relief || 0)
          : Number(r.special?.tax_relief || 0);
        const cumulTaxPaid = isFirstMonth
          ? Number(opening.cumul_tax_paid || 0)
          : Number(prev.cumul_tax_paid || 0) + Number(prev.monthly_tax || 0);
        // 累计减除费用 = 5000 × 已任职月份数
        const employedMonths = Number(r.employed_months || monthNum);
        const cumulBasicDeduction = 5000 * employedMonths;

        const result = calcIncomeTax({
          cumul_taxable_income: cumulTaxableIncome,
          cumul_tax_free_income: 0,
          cumul_basic_deduction: cumulBasicDeduction,
          cumul_five_insurance: cumulFiveInsurance,
          cumul_special_deduct: cumulSpecialDeduct,
          cumul_other_deduct: cumulOtherDeduct,
          cumul_tax_relief: cumulTaxRelief,
          cumul_tax_paid: cumulTaxPaid,
        });

        const payload = {
          unique_hash: r.unique_hash,
          period,
          current_taxable_income: r.current_taxable_income,
          current_tax_free_income: 0,
          current_five_insurance: r.current_five_insurance,
          current_special_deduct: r.current_special_deduct,
          current_other_deduct: r.current_other_deduct,
          current_tax_relief: r.current_tax_relief,
          cumul_taxable_income: cumulTaxableIncome,
          cumul_tax_free_income: 0,
          cumul_basic_deduction: cumulBasicDeduction,
          cumul_five_insurance: cumulFiveInsurance,
          cumul_special_deduct: cumulSpecialDeduct,
          cumul_other_deduct: cumulOtherDeduct,
          cumul_tax_relief: cumulTaxRelief,
          cumul_tax_paid: cumulTaxPaid,
          cumul_taxable_income_net: result.cumul_taxable_income_net,
          tax_rate: result.tax_rate,
          quick_deduction: result.quick_deduction,
          monthly_tax: result.monthly_tax,
        };

        const existing = await api.get(`/tax_monthly_calcs?unique_hash=eq.${r.unique_hash}&period=eq.${period}`);
        if (existing.data.length > 0) {
          await api.patch(`/tax_monthly_calcs?id=eq.${existing.data[0].id}`, payload);
        } else {
          await api.post('/tax_monthly_calcs', payload);
        }
        success++;
      } catch { /* skip */ }
    }
    message.success(`计算完成：${success} / ${records.length} 条`);
    loadData();
  };

  // 联动薪酬板块：把当月个人所得税写入 salary_records
  const handleSync = async () => {
    let success = 0;
    for (const r of records) {
      try {
        if (r.monthly_tax === undefined) continue;
        const existing = await api.get(`/salary_records?unique_hash=eq.${r.unique_hash}&period=eq.${period}`);
        if (existing.data.length > 0) {
          await api.patch(`/salary_records?id=eq.${existing.data[0].id}`, { monthly_tax: r.monthly_tax });
          success++;
        }
      } catch { /* skip */ }
    }
    message.success(`已同步 ${success} 条到薪酬板块`);
  };

  const columns: any[] = [
    { title: withSource('姓名', '花名册同步'), dataIndex: 'employee_name', key: 'name', width: 90, fixed: 'left' },
    { title: withSource('发薪公司', '花名册同步'), dataIndex: 'pay_company', key: 'co', width: 130, ellipsis: true, fixed: 'left' },
    { title: withSource('成本中心', '花名册同步'), dataIndex: 'cost_center', key: 'cc', width: 90 },
    { title: withSource('部门', '花名册同步'), dataIndex: 'department', key: 'dept', width: 90 },
    { title: withSource('汇报人', '花名册同步'), dataIndex: 'report_to', key: 'rpt', width: 80 },
    { title: withSource('职位', '花名册同步'), dataIndex: 'position', key: 'pos', width: 90 },
    { title: withSource('入职日期', '花名册同步'), dataIndex: 'entry_date', key: 'jd', width: 100 },
    { title: withSource('考勤制', '花名册同步'), dataIndex: 'attendance_type', key: 'ws', width: 100 },
    { title: withSource('本期应税收入', '系统计算'), dataIndex: 'current_taxable_income', key: 'cti', width: 120, render: fmtMoney },
    { title: withSource('本期五险一金', '系统计算'), dataIndex: 'current_five_insurance', key: 'cfi', width: 120, render: fmtMoney },
    { title: withSource('本期专项附加', '系统计算'), dataIndex: 'current_special_deduct', key: 'csd', width: 120, render: fmtMoney },
    { title: withSource('本期其他扣除', '系统计算'), dataIndex: 'current_other_deduct', key: 'cod', width: 120, render: fmtMoney },
    { title: withSource('本期减免税额', '系统计算'), dataIndex: 'current_tax_relief', key: 'ctr', width: 120, render: fmtMoney },
    { title: withSource('累计应税收入', '系统计算'), dataIndex: 'cumul_taxable_income', key: 'cti2', width: 130, render: fmtMoney },
    { title: withSource('累计减除费用', '系统计算'), dataIndex: 'cumul_basic_deduction', key: 'cbd', width: 120, render: fmtMoney },
    { title: withSource('累计五险一金', '系统计算'), dataIndex: 'cumul_five_insurance', key: 'cfi2', width: 120, render: fmtMoney },
    { title: withSource('累计专项附加', '系统计算'), dataIndex: 'cumul_special_deduct', key: 'csd2', width: 120, render: fmtMoney },
    { title: withSource('累计其他扣除', '系统计算'), dataIndex: 'cumul_other_deduct', key: 'cod2', width: 120, render: fmtMoney },
    { title: withSource('累计减免税额', '系统计算'), dataIndex: 'cumul_tax_relief', key: 'ctr2', width: 120, render: fmtMoney },
    { title: withSource('累计应纳税所得额', '系统计算'), dataIndex: 'cumul_taxable_income_net', key: 'ctin', width: 140, render: fmtMoney },
    { title: withSource('预扣率', '系统计算'), dataIndex: 'tax_rate', key: 'tr', width: 80, render: (v: any) => v ? `${(v * 100).toFixed(0)}%` : '—' },
    { title: withSource('速算扣除数', '系统计算'), dataIndex: 'quick_deduction', key: 'qd', width: 100, render: fmtMoney },
    { title: withSource('当月个人所得税', '系统计算'), dataIndex: 'monthly_tax', key: 'mt', width: 130, fixed: 'right',
      render: (v: any) => <strong style={{ color: '#e74c3c' }}>{fmtMoney(v)}</strong> },
  ];

  return (
    <Card size="small" title="个税月度计算（累计预扣法）">
      <Space style={{ marginBottom: 12 }}>
        <span>所得期间：</span>
        <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 180 }} />
        <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalc}>计算当月个税</Button>
        <Button icon={<LinkOutlined />} onClick={handleSync}>同步到薪酬板块</Button>
      </Space>
      <Table columns={columns} dataSource={records} loading={loading} scroll={{ x: 2000 }} size="small" pagination={{ pageSize: 50 }} />
    </Card>
  );
};

export default TaxMonthlyCalcPage;
