import React, { useEffect, useState, useMemo } from 'react';
import { Card, Table, Select, DatePicker, Button, Space, message, Tag, Modal, Descriptions } from 'antd';
import { PlayCircleOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchEmployees, fetchSalaryRecords, runPayroll, exportSalary } from '../api/endpoints';
import { fetchCompanies } from '../api/endpoints';
import { formatMoney } from '../utils/format';
import type { Employee, SalaryRecord } from '../types';

const taxTypeMap: Record<string, string> = { normal: '累计预扣', service: '劳务20%', non_taxable: '免税' };

const PayrollPage: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>();
  const [period, setPeriod] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  );
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<SalaryRecord | null>(null);

  useEffect(() => {
    fetchCompanies().then(res => {
      setCompanies(res.data.companies);
      if (!selectedCompany && res.data.companies.length > 0) {
        setSelectedCompany(res.data.companies[0].code);
      }
    }).catch(() => message.error('加载公司失败'));
  }, []);

  useEffect(() => {
    if (selectedCompany) loadData();
  }, [selectedCompany, period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, recRes] = await Promise.all([
        fetchEmployees({ company_code: selectedCompany, is_active: true }),
        fetchSalaryRecords(period, selectedCompany),
      ]);
      setEmployees(empRes.data);
      setRecords(recRes.data);
    } catch { message.error('加载数据失败'); }
    finally { setLoading(false); }
  };

  const handleRunPayroll = async () => {
    setRunning(true);
    try {
      const res = await runPayroll({ period });
      message.success(`计算完成：${res.data.success_count}/${res.data.total_employees} 人成功`);
      loadData();
    } catch (e: any) {
      message.error('计算失败: ' + (e.response?.data?.detail || e.message));
    } finally { setRunning(false); }
  };

  const handleExport = async () => {
    try {
      const res = await exportSalary(period, selectedCompany);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `薪资明细_${period}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { message.error('导出失败'); }
  };

  const showDetail = (rec: SalaryRecord) => {
    setSelectedRecord(rec);
    setDetailOpen(true);
  };

  const totals = useMemo(() => ({
    wages: records.reduce((s, r) => s + (r.wage_subtotal || 0), 0),
    tax: records.reduce((s, r) => s + (r.tax_amount || 0), 0),
    net: records.reduce((s, r) => s + (r.net_pay || 0), 0),
    cost: records.reduce((s, r) => s + (r.total_cost || 0), 0),
  }), [records]);

  const columns = [
    { title: '工号', dataIndex: 'employee_id', key: 'no', width: 90, render: (id: number) => employees.find(e => e.id === id)?.employee_no || '—' },
    { title: '姓名', dataIndex: 'employee_id', key: 'name', width: 70, render: (id: number) => employees.find(e => e.id === id)?.name || '—' },
    { title: '计税', dataIndex: 'employee_id', key: 'tax', width: 80, render: (id: number) => {
      const emp = employees.find(e => e.id === id);
      return <Tag>{taxTypeMap[emp?.tax_type || ''] || '—'}</Tag>;
    }},
    { title: '本月工资', dataIndex: 'monthly_wage', key: 'f1', width: 100, render: (v: any) => formatMoney(v) },
    { title: '薪资小计', dataIndex: 'wage_subtotal', key: 'f2', width: 100, render: (v: any) => formatMoney(v) },
    { title: '个税', dataIndex: 'tax_amount', key: 'tax', width: 90, render: (v: any) => formatMoney(v) },
    { title: '银行实发', dataIndex: 'net_pay', key: 'net', width: 100, render: (v: any) => <strong style={{ color: '#52c41a' }}>{formatMoney(v)}</strong> },
    { title: '人力成本', dataIndex: 'total_cost', key: 'cost', width: 100, render: (v: any) => formatMoney(v) },
    {
      title: '操作', key: 'act', width: 70, fixed: 'right' as const,
      render: (_: any, r: SalaryRecord) => <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(r)} />,
    },
  ];

  const companyName = companies.find(c => c.code === selectedCompany)?.full_name || '';

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select style={{ width: 280 }} value={selectedCompany} onChange={setSelectedCompany}
            showSearch optionFilterProp="label"
            options={companies.map(c => ({ value: c.code, label: c.full_name }))} />
          <DatePicker picker="month" value={dayjs(period)} onChange={d => d && setPeriod(d.format('YYYY-MM'))}
            format="YYYY-MM" allowClear={false} />
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRunPayroll} loading={running}>
            计算薪资
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={records.length === 0}>
            导出 Excel
          </Button>
        </Space>
      </Card>

      {/* 合计栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="large">
          <span>本月薪资小计：<strong>{formatMoney(totals.wages)}</strong></span>
          <span>本月个税：<strong>{formatMoney(totals.tax)}</strong></span>
          <span>银行实发：<strong style={{ color: '#52c41a' }}>{formatMoney(totals.net)}</strong></span>
          <span>人力成本：<strong>{formatMoney(totals.cost)}</strong></span>
        </Space>
      </Card>

      <Table columns={columns}
        dataSource={records.map(r => ({ ...r, key: r.id }))}
        loading={loading} scroll={{ x: 900 }} size="small"
        pagination={{ pageSize: 50, showTotal: t => `共 ${t} 条` }}
        locale={{ emptyText: '暂无数据' }} />

      {/* 明细弹窗 */}
      <Modal title="薪资明细" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={700}>
        {selectedRecord && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="员工">{employees.find(e => e.id === selectedRecord.employee_id)?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="月份">{selectedRecord.period}</Descriptions.Item>
            <Descriptions.Item label="基本工资">{formatMoney(selectedRecord.base_salary)}</Descriptions.Item>
            <Descriptions.Item label="补贴">{formatMoney(selectedRecord.allowance)}</Descriptions.Item>
            <Descriptions.Item label="考勤调整">{formatMoney(selectedRecord.attendance_adjust)}</Descriptions.Item>
            <Descriptions.Item label="KPI预提">{formatMoney(selectedRecord.kpi_provision)}</Descriptions.Item>
            <Descriptions.Item label="本月工资 F1"><strong>{formatMoney(selectedRecord.monthly_wage)}</strong></Descriptions.Item>
            <Descriptions.Item label="薪资小计 F2"><strong>{formatMoney(selectedRecord.wage_subtotal)}</strong></Descriptions.Item>
            <Descriptions.Item label="个人社保 F3">{formatMoney(selectedRecord.personal_welfare)}</Descriptions.Item>
            <Descriptions.Item label="个税 F11/F14">{formatMoney(selectedRecord.tax_amount)}</Descriptions.Item>
            <Descriptions.Item label="银行实发 F15"><strong style={{ color: '#52c41a', fontSize: 16 }}>{formatMoney(selectedRecord.net_pay)}</strong></Descriptions.Item>
            <Descriptions.Item label="公司社保 F17">{formatMoney(selectedRecord.company_welfare)}</Descriptions.Item>
            <Descriptions.Item label="人力成本 F25"><strong>{formatMoney(selectedRecord.total_cost)}</strong></Descriptions.Item>
            <Descriptions.Item label="税率级数">{selectedRecord.tax_bracket_level ? `第${selectedRecord.tax_bracket_level}级` : '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default PayrollPage;
