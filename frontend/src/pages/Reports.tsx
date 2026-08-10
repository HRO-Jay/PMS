import React, { useEffect, useState } from 'react';
import { Card, Table, Select, DatePicker, Button, Space, Statistic, Row, Col, message, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchCompanySummary, exportSalary } from '../api/endpoints';
import { formatMoney, regionColor } from '../utils/format';
import type { CompanySummaryItem } from '../types';

const ReportsPage: React.FC = () => {
  const [period, setPeriod] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [summary, setSummary] = useState<CompanySummaryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchCompanySummary(period);
      setSummary(res.data.companies);
    } catch { message.error('加载报表失败'); }
    finally { setLoading(false); }
  };

  const handleExportAll = async () => {
    try {
      const res = await exportSalary(period);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `薪资全公司汇总_${period}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { message.error('导出失败'); }
  };

  const grandTotal = {
    companies: summary.length,
    employees: summary.reduce((s, c) => s + c.employee_count, 0),
    wages: summary.reduce((s, c) => s + c.total_wages, 0),
    tax: summary.reduce((s, c) => s + c.total_tax, 0),
    net: summary.reduce((s, c) => s + c.total_net_pay, 0),
    cost: summary.reduce((s, c) => s + c.total_cost, 0),
  };

  const columns = [
    {
      title: '公司', dataIndex: 'company_full_name', key: 'name', width: 280, ellipsis: true,
      render: (v: string, r: CompanySummaryItem) => (
        <Space>
          <Tag color={regionColor(r.region)}>{r.region}</Tag>
          {v}
        </Space>
      ),
    },
    { title: '人数', dataIndex: 'employee_count', key: 'cnt', width: 60 },
    { title: '薪资小计', dataIndex: 'total_wages', key: 'wages', width: 110, render: (v: number) => formatMoney(v) },
    { title: '个人社保', dataIndex: 'total_personal_welfare', key: 'pw', width: 100, render: (v: number) => formatMoney(v) },
    { title: '个税', dataIndex: 'total_tax', key: 'tax', width: 100, render: (v: number) => formatMoney(v) },
    { title: '银行实发', dataIndex: 'total_net_pay', key: 'net', width: 110, render: (v: number) => <strong style={{ color: '#52c41a' }}>{formatMoney(v)}</strong> },
    { title: '公司社保', dataIndex: 'total_company_welfare', key: 'cw', width: 100, render: (v: number) => formatMoney(v) },
    { title: '人力成本', dataIndex: 'total_cost', key: 'cost', width: 110, render: (v: number) => <strong>{formatMoney(v)}</strong> },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <DatePicker picker="month" value={dayjs(period)}
            onChange={d => d && setPeriod(d.format('YYYY-MM'))} format="YYYY-MM" allowClear={false} />
          <Button icon={<DownloadOutlined />} onClick={handleExportAll}>导出全公司 Excel</Button>
        </Space>
      </Card>

      {/* 汇总 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="覆盖公司" value={grandTotal.companies} suffix="家" /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="覆盖员工" value={grandTotal.employees} suffix="人" /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="全公司银行实发" value={grandTotal.net} precision={2} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="全公司人力成本" value={grandTotal.cost} precision={2} /></Card>
        </Col>
      </Row>

      {/* 分表 */}
      <Card title={`各公司汇总 — ${period}`}>
        <Table columns={columns}
          dataSource={summary.map(s => ({ ...s, key: s.company_code }))}
          loading={loading} size="small" scroll={{ x: 1000 }}
          pagination={false}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1}><strong>{grandTotal.employees}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={2}><strong>{formatMoney(grandTotal.wages)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={3}><strong>{formatMoney(summary.reduce((s, c) => s + c.total_personal_welfare, 0))}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={4}><strong>{formatMoney(grandTotal.tax)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={5}><strong style={{ color: '#52c41a' }}>{formatMoney(grandTotal.net)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={6}><strong>{formatMoney(summary.reduce((s, c) => s + c.total_company_welfare, 0))}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={7}><strong>{formatMoney(grandTotal.cost)}</strong></Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>
    </div>
  );
};

export default ReportsPage;
