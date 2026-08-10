import React, { useEffect, useState } from 'react';
import { Table, Card, Select, DatePicker, Button, Space, Input, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchEmployees, fetchAttendance, upsertAttendance } from '../api/endpoints';
import { fetchCompanies } from '../api/endpoints';
import type { Employee, AttendanceRecord } from '../types';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const AttendancePage: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>();
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);

  // 本地编辑状态: employee_id → 各字段值
  const [editData, setEditData] = useState<Record<number, { sick: number; personal: number; annual: number; overtime: number; adjust: number }>>({});

  useEffect(() => {
    fetchCompanies().then(res => {
      setCompanies(res.data.companies);
      if (!selectedCompany) setSelectedCompany(res.data.companies[0]?.code);
    });
  }, []);

  useEffect(() => {
    if (selectedCompany) loadData();
  }, [selectedCompany, period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, attRes] = await Promise.all([
        fetchEmployees({ company_code: selectedCompany, is_active: true }),
        fetchAttendance(period),
      ]);
      setEmployees(empRes.data);
      setRecords(attRes.data.records);

      // 初始化编辑数据
      const initEdit: Record<number, any> = {};
      empRes.data.forEach(emp => {
        const rec = attRes.data.records.find((r: AttendanceRecord) => r.employee_id === emp.id);
        initEdit[emp.id] = {
          sick: rec?.sick_days || 0,
          personal: rec?.personal_days || 0,
          annual: rec?.annual_leave || 0,
          overtime: rec?.overtime_days || 0,
          adjust: rec?.adjustment_amount || 0,
        };
      });
      setEditData(initEdit);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  const updateField = (empId: number, field: string, value: number) => {
    setEditData(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: value },
    }));
  };

  const handleSave = async (empId: number) => {
    const d = editData[empId];
    if (!d) return;
    try {
      await upsertAttendance({
        employee_id: empId,
        period,
        sick_days: d.sick,
        personal_days: d.personal,
        annual_leave: d.annual,
        overtime_days: d.overtime,
        adjustment_amount: d.adjust,
      });
      message.success('保存成功');
      loadData();
    } catch { message.error('保存失败'); }
  };

  const columns = [
    { title: '工号', dataIndex: 'employee_no', key: 'no', width: 100 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 80 },
    {
      title: '病假', key: 'sick', width: 100,
      render: (_: any, emp: Employee) => (
        <Input type="number" size="small" style={{ width: 80 }}
          value={editData[emp.id]?.sick ?? 0}
          onChange={e => updateField(emp.id, 'sick', Number(e.target.value))}
          suffix="天" />
      ),
    },
    {
      title: '事假', key: 'personal', width: 100,
      render: (_: any, emp: Employee) => (
        <Input type="number" size="small" style={{ width: 80 }}
          value={editData[emp.id]?.personal ?? 0}
          onChange={e => updateField(emp.id, 'personal', Number(e.target.value))}
          suffix="天" />
      ),
    },
    {
      title: '年假', key: 'annual', width: 100,
      render: (_: any, emp: Employee) => (
        <Input type="number" size="small" style={{ width: 80 }}
          value={editData[emp.id]?.annual ?? 0}
          onChange={e => updateField(emp.id, 'annual', Number(e.target.value))}
          suffix="天" />
      ),
    },
    {
      title: '加班', key: 'overtime', width: 100,
      render: (_: any, emp: Employee) => (
        <Input type="number" size="small" style={{ width: 80 }}
          value={editData[emp.id]?.overtime ?? 0}
          onChange={e => updateField(emp.id, 'overtime', Number(e.target.value))}
          suffix="天" />
      ),
    },
    {
      title: '调整金额', key: 'adjust', width: 120,
      render: (_: any, emp: Employee) => (
        <Input type="number" size="small" style={{ width: 100 }}
          value={editData[emp.id]?.adjust ?? 0}
          onChange={e => updateField(emp.id, 'adjust', Number(e.target.value))}
          prefix="¥" />
      ),
    },
    {
      title: '操作', key: 'act', width: 80, fixed: 'right' as const,
      render: (_: any, emp: Employee) => (
        <Button size="small" type="primary" icon={<SaveOutlined />}
          onClick={() => handleSave(emp.id)}>保存</Button>
      ),
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select style={{ width: 280 }} value={selectedCompany} onChange={setSelectedCompany}
            showSearch optionFilterProp="label"
            options={companies.map(c => ({ value: c.code, label: c.full_name }))} />
          <DatePicker picker="month" value={dayjs(period)} onChange={d => d && setPeriod(d.format('YYYY-MM'))}
            format="YYYY-MM" allowClear={false} />
        </Space>
      </Card>

      <Card title={`考勤录入 — ${period}`} extra={<span>病假扣50%日薪 · 事假扣100% · 加班补100% · 年假不扣</span>}>
        <Table columns={columns} dataSource={employees.map(e => ({ ...e, key: e.id }))}
          loading={loading} scroll={{ x: 800 }} size="small"
          pagination={{ pageSize: 50 }} />
      </Card>
    </div>
  );
};

export default AttendancePage;
