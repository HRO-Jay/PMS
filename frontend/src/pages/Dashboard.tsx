import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Statistic, Table, Select, DatePicker, Button, Tag, Space, message, Modal, Progress } from 'antd';
import { PlayCircleOutlined, DownloadOutlined, CalculatorOutlined, TeamOutlined, DollarOutlined, PieChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchEmployees, fetchSalaryRecords, runPayroll, exportSalary, fetchCompanySummary } from '../api/endpoints';
import { fetchCompanies } from '../api/endpoints';
import { useStore } from '../stores/appStore';
import { formatMoney, regionColor } from '../utils/format';
import type { Employee, SalaryRecord, CompanySummaryItem } from '../types';

const Dashboard: React.FC = () => {
  const { companies, setCompanies, employees, setEmployees, currentPeriod, setCurrentPeriod, selectedCompany, setSelectedCompany } = useStore();
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<CompanySummaryItem[]>([]);
  const [runModalVisible, setRunModalVisible] = useState(false);
  const [runProgress, setRunProgress] = useState(0);

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompany) loadData();
  }, [selectedCompany, currentPeriod]);

  const loadCompanies = async () => {
    try {
      const res = await fetchCompanies();
      setCompanies(res.data.companies);
      if (!selectedCompany && res.data.companies.length > 0) {
        setSelectedCompany(res.data.companies[0].code);
      }
    } catch (e) {
      message.error('加载公司列表失败');
    }
  };

  const loadData = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [empRes, recRes, sumRes] = await Promise.all([
        fetchEmployees({ company_code: selectedCompany, is_active: true }),
        fetchSalaryRecords(currentPeriod, selectedCompany),
        fetchCompanySummary(currentPeriod),
      ]);
      setEmployees(empRes.data);
      setRecords(recRes.data);
      setSummary(sumRes.data.companies.filter(c => c.company_code === selectedCompany));
    } catch (e) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRunPayroll = async () => {
    setRunning(true);
    setRunProgress(0);
    try {
      const res = await runPayroll({ period: currentPeriod });
      const total = res.data.total_employees;
      const success = res.data.success_count;

      // 模拟进度
      for (let i = 0; i <= 100; i += 10) {
        setRunProgress(i);
        await new Promise(r => setTimeout(r, 200));
      }
      setRunProgress(100);

      message.success(`计算完成！${success}/${total} 人成功`);
      setRunModalVisible(false);
      loadData();
    } catch (e: any) {
      message.error('计算失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await exportSalary(currentPeriod, selectedCompany || undefined);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `薪资明细_${currentPeriod}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (e) {
      message.error('导出失败');
    }
  };

  const totals = useMemo(() => {
    if (!records.length) return { wages: 0, tax: 0, net: 0, cost: 0, count: 0 };
    return {
      wages: records.reduce((s, r) => s + (r.wage_subtotal || 0), 0),
      tax: records.reduce((s, r) => s + (r.tax_amount || 0), 0),
      net: records.reduce((s, r) => s + (r.net_pay || 0), 0),
      cost: records.reduce((s, r) => s + (r.total_cost || 0), 0),
      count: records.length,
    };
  }, [records]);

  const company = companies.find(c => c.code === selectedCompany);

  const columns = [
    { title: '工号', dataIndex: 'employee_no', key: 'no', width: 100, render: (_: any, r: any) => {
      const emp = employees.find(e => e.id === r.employee_id);
      return emp?.employee_no || '—';
    }},
    { title: '姓名', dataIndex: 'employee_id', key: 'name', width: 80, render: (_: any, r: any) => {
      const emp = employees.find(e => e.id === r.employee_id);
      return emp?.name || '—';
    }},
    { title: '本月工资', dataIndex: 'monthly_wage', key: 'f1', width: 110, render: (v: any) => formatMoney(v) },
    { title: '薪资小计', dataIndex: 'wage_subtotal', key: 'f2', width: 110, render: (v: any) => formatMoney(v) },
    { title: '个人社保', dataIndex: 'personal_welfare', key: 'f3', width: 100, render: (v: any) => formatMoney(v) },
    { title: '个税', dataIndex: 'tax_amount', key: 'f11', width: 100, render: (v: any) => formatMoney(v) },
    { title: '银行实发', dataIndex: 'net_pay', key: 'f15', width: 110, render: (v: any) => <strong>{formatMoney(v)}</strong> },
    { title: '公司社保', dataIndex: 'company_welfare', key: 'f17', width: 100, render: (v: any) => formatMoney(v) },
    { title: '人力成本', dataIndex: 'total_cost', key: 'f25', width: 110, render: (v: any) => formatMoney(v) },
    { title: '状态', dataIndex: 'is_locked', key: 'lock', width: 70, render: (v: boolean) => v ? <Tag color="red">锁定</Tag> : <Tag color="green">正常</Tag> },
  ];

  return (
    <div>
      {/* 工具栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            style={{ width: 280 }}
            value={selectedCompany}
            onChange={setSelectedCompany}
            showSearch
            optionFilterProp="label"
            options={companies.map(c => ({
              value: c.code,
              label: c.full_name,
            }))}
          />
          <DatePicker
            picker="month"
            value={dayjs(currentPeriod)}
            onChange={(d) => d && setCurrentPeriod(d.format('YYYY-MM'))}
            format="YYYY-MM"
            allowClear={false}
          />
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setRunModalVisible(true)}>
            计算本月薪资
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={records.length === 0}>
            导出 Excel
          </Button>
          <Tag color="blue">{company?.region || ''}</Tag>
          <Tag>{company?.social_policy || ''}</Tag>
        </Space>
      </Card>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="员工人数" value={employees.length} prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="薪资小计合计" value={totals.wages} precision={2} prefix={<DollarOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="银行实发合计" value={totals.net} precision={2} prefix={<CalculatorOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="企业人力成本" value={totals.cost} precision={2} prefix={<PieChartOutlined />} /></Card>
        </Col>
      </Row>

      {/* 明细表 */}
      <Card title={`薪资明细 — ${currentPeriod}`} style={{}}>
        <Table
          columns={columns}
          dataSource={records.map(r => ({ ...r, key: r.id }))}
          loading={loading}
          scroll={{ x: 1100 }}
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          locale={{ emptyText: '暂无数据，请点击「计算本月薪资」开始计算' }}
        />
      </Card>

      {/* 计算确认弹窗 */}
      <Modal
        title="确认薪资计算"
        open={runModalVisible}
        onOk={handleRunPayroll}
        onCancel={() => setRunModalVisible(false)}
        confirmLoading={running}
        okText="开始计算"
        cancelText="取消"
      >
        <p>将执行以下操作：</p>
        <ul>
          <li>公司：<strong>{company?.full_name}</strong></li>
          <li>月份：<strong>{currentPeriod}</strong></li>
          <li>在职员工：<strong>{employees.length} 人</strong></li>
          <li>计算内容：月工资、社保公积金（个人+公司）、个税（累计预扣）、实发金额、人力成本</li>
        </ul>
        {running && <Progress percent={runProgress} status="active" />}
      </Modal>
    </div>
  );
};

export default Dashboard;
