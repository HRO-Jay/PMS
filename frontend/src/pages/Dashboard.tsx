import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Statistic, Space, Input, message, Table, Tag } from 'antd';
import { TeamOutlined, DollarOutlined, BankOutlined, CalculatorOutlined } from '@ant-design/icons';
import { fetchEmployees } from '../api/endpoints';
import api from '../api/client';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const Dashboard: React.FC = () => {
  const [period, setPeriod] = useState(defaultPeriod);
  const [stats, setStats] = useState<{ employee_count: number; total_wages: number; total_net_pay: number; total_cost: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [topCosts, setTopCosts] = useState<any[]>([]);

  useEffect(() => { loadStats(); }, [period]);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Employee count
      const empRes = await api.get('/employees?select=id&status=eq.在职');
      const empCount = empRes.data.length;

      // Salary summary
      const salRes = await api.get(`/salary_records?select=wage_subtotal,net_pay,total_cost,unique_hash&period=eq.${period}`);
      const totalWages = salRes.data.reduce((s: number, r: any) => s + (r.wage_subtotal || 0), 0);
      const totalNetPay = salRes.data.reduce((s: number, r: any) => s + (r.net_pay || 0), 0);
      const totalCost = salRes.data.reduce((s: number, r: any) => s + (r.total_cost || 0), 0);

      setStats({
        employee_count: empCount,
        total_wages: totalWages,
        total_net_pay: totalNetPay,
        total_cost: totalCost,
      });

      // Company-level aggregation
      const fullSalData = await api.get(
        `/salary_records?select=unique_hash,wage_subtotal,net_pay,total_cost&period=eq.${period}`
      );
      const empData = await api.get('/employees?select=unique_hash,pay_company');
      const companyMap: Record<string, string> = {};
      empData.data.forEach((e: any) => { companyMap[e.unique_hash] = e.pay_company; });

      const byCompany: Record<string, { name: string; wages: number; net: number; cost: number }> = {};
      fullSalData.data.forEach((r: any) => {
        const name = companyMap[r.unique_hash] || '未知';
        if (!byCompany[name]) byCompany[name] = { name, wages: 0, net: 0, cost: 0 };
        byCompany[name].wages += r.wage_subtotal || 0;
        byCompany[name].net += r.net_pay || 0;
        byCompany[name].cost += r.total_cost || 0;
      });
      setTopCosts(Object.values(byCompany).sort((a, b) => b.cost - a.cost));
    } catch { message.error('加载数据总览失败'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <span>月份：</span>
        <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 200 }} />
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="在职员工" value={stats?.employee_count || 0} prefix={<TeamOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="当月薪资总额" value={stats?.total_wages || 0} precision={2} prefix="¥" /></Card></Col>
        <Col span={6}><Card><Statistic title="当月实发总额" value={stats?.total_net_pay || 0} precision={2} prefix="¥" /></Card></Col>
        <Col span={6}><Card><Statistic title="当月人力成本" value={stats?.total_cost || 0} precision={2} prefix="¥" /></Card></Col>
      </Row>

      <Card title="各公司人力成本">
        <Table
          dataSource={topCosts.map((c, i) => ({ ...c, key: i }))}
          loading={loading}
          size="small"
          pagination={false}
          columns={[
            { title: '公司', dataIndex: 'name', key: 'name', ellipsis: true },
            { title: '薪资总额', dataIndex: 'wages', key: 'wages', render: (v:number) => `¥${v.toLocaleString()}` },
            { title: '实发总额', dataIndex: 'net', key: 'net', render: (v:number) => `¥${v.toLocaleString()}` },
            { title: '人力成本', dataIndex: 'cost', key: 'cost', render: (v:number) => <strong>¥{v.toLocaleString()}</strong> },
          ]}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
