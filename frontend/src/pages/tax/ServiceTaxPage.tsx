import React, { useEffect, useState } from 'react';
import { Table, Card, Space, Input, message, Button, Tag } from 'antd';
import { CalculatorOutlined, SaveOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { withSource } from '../../components/SourceTag';

/**
 * 个税扣缴 — 劳务个税计算（计税方式为"劳务计税"的人员）
 * 当月个人所得税 = (薪资小计 - 800) × 20%
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ServiceTaxPage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 只取计税方式为"劳务计税"(service)的人员
      const [empRes, salaryRes] = await Promise.all([
        api.get('/employees?select=unique_hash,name,status,pay_company,tax_method&tax_method=eq.service'),
        api.get(`/salary_records?select=unique_hash,wage_subtotal,monthly_tax&period=eq.${period}`),
      ]);

      const salaryMap: Record<string, any> = {};
      salaryRes.data.forEach((r: any) => { salaryMap[r.unique_hash] = r; });

      const merged = empRes.data
        .filter((e: any) => e.status === '在职' || salaryMap[e.unique_hash])
        .map((e: any) => {
          const sal = salaryMap[e.unique_hash] || {};
          const wageSubtotal = Number(sal.wage_subtotal || 0);
          // 劳务个税 = (薪资小计 - 800) × 20%，最低 0
          const monthlyTax = wageSubtotal <= 800 ? 0 : Number(((wageSubtotal - 800) * 0.20).toFixed(2));
          return {
            key: `emp-${e.unique_hash}`,
            unique_hash: e.unique_hash,
            employee_name: e.name,
            pay_company: e.pay_company || '',
            tax_method: e.tax_method || 'service',
            wage_subtotal: wageSubtotal,
            monthly_tax: sal.monthly_tax !== undefined && sal.monthly_tax !== null ? Number(sal.monthly_tax) : monthlyTax,
          };
        });

      setRecords(merged);
    } catch { message.error('加载劳务个税数据失败'); }
    finally { setLoading(false); }
  };

  // 计算并保存劳务个税
  const handleCalc = async () => {
    let success = 0;
    for (const r of records) {
      try {
        const wageSubtotal = Number(r.wage_subtotal || 0);
        const monthlyTax = wageSubtotal <= 800 ? 0 : Number(((wageSubtotal - 800) * 0.20).toFixed(2));
        const existing = await api.get(`/salary_records?unique_hash=eq.${r.unique_hash}&period=eq.${period}`);
        if (existing.data.length > 0) {
          await api.patch(`/salary_records?id=eq.${existing.data[0].id}`, { monthly_tax: monthlyTax });
        } else {
          await api.post('/salary_records', {
            unique_hash: r.unique_hash,
            period,
            month_number: parseInt(period.split('-')[1]) || 1,
            wage_subtotal: wageSubtotal,
            monthly_tax: monthlyTax,
          });
        }
        success++;
      } catch { /* skip */ }
    }
    message.success(`劳务个税计算完成：${success} / ${records.length} 条`);
    loadData();
  };

  const columns: any[] = [
    { title: withSource('姓名', '花名册同步'), dataIndex: 'employee_name', key: 'name', width: 90, fixed: 'left' },
    { title: withSource('发薪公司', '花名册同步'), dataIndex: 'pay_company', key: 'co', width: 140, ellipsis: true, fixed: 'left' },
    { title: withSource('计税方式', '花名册同步'), dataIndex: 'tax_method', key: 'tm', width: 90,
      render: (v: string) => <Tag color="orange">{v === 'service' ? '劳务计税' : v}</Tag> },
    { title: withSource('薪资小计', '薪资计算同步'), dataIndex: 'wage_subtotal', key: 'ws', width: 130, render: fmtMoney },
    { title: withSource('当月个人所得税', '系统计算'), dataIndex: 'monthly_tax', key: 'mt', width: 130,
      render: (v: any) => <strong style={{ color: '#e74c3c' }}>{fmtMoney(v)}</strong> },
  ];

  return (
    <Card size="small" title="劳务个税计算（劳务报酬，计税方式为劳务计税的人员）">
      <Space style={{ marginBottom: 12 }}>
        <span>所得期间：</span>
        <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 180 }} />
        <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalc}>计算劳务个税</Button>
      </Space>
      <div style={{ marginBottom: 12, color: '#888' }}>
        计算口径：当月个人所得税 =（薪资小计 − 800）× 20%，薪资小计不超过 800 元时为 0。
      </div>
      <Table columns={columns} dataSource={records} loading={loading} scroll={{ x: 800 }} size="small" pagination={{ pageSize: 50 }} />
    </Card>
  );
};

export default ServiceTaxPage;
