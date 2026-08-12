import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Space, Input, message, InputNumber } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import api from '../api/client';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const AttendancePage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 加载考勤记录，关联员工基础信息
      const res = await api.get(
        `/attendance_records?select=*&period=eq.${period}&order=unique_hash`
      );
      // 加载员工姓名映射
      const empRes = await api.get('/employees?select=unique_hash,name,company_full_name,cost_center,department,reporter,position,join_date,work_schedule&is_active=eq.true');
      const empMap: Record<string, any> = {};
      empRes.data.forEach((e: any) => { empMap[e.unique_hash] = e; });

      setRecords(res.data.map((r: any) => {
        const emp = empMap[r.unique_hash] || {};
        const adjustTotal = (r.sick_adjust || 0) + (r.personal_adjust || 0) + (r.on_off_adjust || 0);
        return {
          ...r,
          key: r.id,
          employee_name: emp.name || r.unique_hash,
          company_full_name: emp.company_full_name || '',
          cost_center: emp.cost_center || '',
          department: emp.department || '',
          reporter: emp.reporter || '',
          position: emp.position || '',
          join_date: emp.join_date || '',
          work_schedule: emp.work_schedule || '',
          attendance_adjust_total: adjustTotal,
        };
      }));
    } catch { message.error('加载考勤数据失败'); }
    finally { setLoading(false); }
  };

  const handleSave = async (record: any) => {
    try {
      await api.post('/attendance_records', {
        unique_hash: record.unique_hash,
        period,
        sick_days: record.sick_days,
        sick_adjust: record.sick_adjust,
        personal_days: record.personal_days,
        personal_adjust: record.personal_adjust,
        annual_leave: record.annual_leave,
        compensatory_leave: record.compensatory_leave,
        absenteeism_days: record.absenteeism_days,
        funeral_leave: record.funeral_leave,
        parental_leave: record.parental_leave,
        marriage_leave: record.marriage_leave,
        maternity_leave: record.maternity_leave,
        overtime_days: record.overtime_days,
        on_off_adjust: record.on_off_adjust,
      });
      message.success(`${record.employee_name} 保存成功`);
    } catch {
      // already exists → try update
      try {
        await api.patch(`/attendance_records?unique_hash=eq.${record.unique_hash}&period=eq.${period}`, {
          sick_days: record.sick_days,
          sick_adjust: record.sick_adjust,
          personal_days: record.personal_days,
          personal_adjust: record.personal_adjust,
          annual_leave: record.annual_leave,
          compensatory_leave: record.compensatory_leave,
          absenteeism_days: record.absenteeism_days,
          funeral_leave: record.funeral_leave,
          parental_leave: record.parental_leave,
          marriage_leave: record.marriage_leave,
          maternity_leave: record.maternity_leave,
          overtime_days: record.overtime_days,
          on_off_adjust: record.on_off_adjust,
        });
        message.success(`${record.employee_name} 更新成功`);
      } catch {
        message.error('保存失败');
      }
    }
  };

  const updateCell = (recordId: number, field: string, value: number | null) => {
    setRecords(prev => prev.map(r =>
      r.id === recordId ? {
        ...r,
        [field]: value ?? 0,
        ...(field.endsWith('_adjust') ? {
          attendance_adjust_total:
            (field === 'sick_adjust' ? (value ?? 0) : (r.sick_adjust || 0)) +
            (field === 'personal_adjust' ? (value ?? 0) : (r.personal_adjust || 0)) +
            (field === 'on_off_adjust' ? (value ?? 0) : (r.on_off_adjust || 0)),
        } : {}),
      } : r
    ));
  };

  const columns = [
    { title: '姓名', dataIndex: 'employee_name', key: 'name', width: 80, fixed: 'left' as const },
    { title: '发薪公司', dataIndex: 'company_full_name', key: 'co', width: 180, ellipsis: true },
    { title: '成本中心', dataIndex: 'cost_center', key: 'cc', width: 80 },
    { title: '部门', dataIndex: 'department', key: 'dept', width: 80 },
    { title: '汇报人', dataIndex: 'reporter', key: 'rpt', width: 70 },
    { title: '职位', dataIndex: 'position', key: 'pos', width: 80 },
    { title: '入职日期', dataIndex: 'join_date', key: 'jd', width: 90 },
    { title: '考勤制', dataIndex: 'work_schedule', key: 'ws', width: 80 },
    { title: '病假(天)', dataIndex: 'sick_days', key: 'sd', width: 80,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:60}} onChange={val=>updateCell(r.id,'sick_days',val)} /> },
    { title: '病假金额', dataIndex: 'sick_adjust', key: 'sa', width: 90,
      render: (v:number, r:any) => <InputNumber size="small" value={v} style={{width:80}} onChange={val=>updateCell(r.id,'sick_adjust',val)} /> },
    { title: '事假(天)', dataIndex: 'personal_days', key: 'pd', width: 80,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:60}} onChange={val=>updateCell(r.id,'personal_days',val)} /> },
    { title: '事假金额', dataIndex: 'personal_adjust', key: 'pa', width: 90,
      render: (v:number, r:any) => <InputNumber size="small" value={v} style={{width:80}} onChange={val=>updateCell(r.id,'personal_adjust',val)} /> },
    { title: '年假', dataIndex: 'annual_leave', key: 'al', width: 70,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:55}} onChange={val=>updateCell(r.id,'annual_leave',val)} /> },
    { title: '调休', dataIndex: 'compensatory_leave', key: 'cl', width: 70,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:55}} onChange={val=>updateCell(r.id,'compensatory_leave',val)} /> },
    { title: '旷工', dataIndex: 'absenteeism_days', key: 'ad', width: 70,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:55}} onChange={val=>updateCell(r.id,'absenteeism_days',val)} /> },
    { title: '丧假', dataIndex: 'funeral_leave', key: 'fl', width: 70,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:55}} onChange={val=>updateCell(r.id,'funeral_leave',val)} /> },
    { title: '育儿假', dataIndex: 'parental_leave', key: 'pl', width: 70,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:55}} onChange={val=>updateCell(r.id,'parental_leave',val)} /> },
    { title: '婚假', dataIndex: 'marriage_leave', key: 'ml', width: 70,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:55}} onChange={val=>updateCell(r.id,'marriage_leave',val)} /> },
    { title: '产假', dataIndex: 'maternity_leave', key: 'ml2', width: 70,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:55}} onChange={val=>updateCell(r.id,'maternity_leave',val)} /> },
    { title: '加班', dataIndex: 'overtime_days', key: 'od', width: 70,
      render: (v:number, r:any) => <InputNumber size="small" min={0} value={v} style={{width:55}} onChange={val=>updateCell(r.id,'overtime_days',val)} /> },
    { title: '入离职调整', dataIndex: 'on_off_adjust', key: 'ooa', width: 100,
      render: (v:number, r:any) => <InputNumber size="small" value={v} style={{width:80}} onChange={val=>updateCell(r.id,'on_off_adjust',val)} /> },
    { title: '考勤调整合计', dataIndex: 'attendance_adjust_total', key: 'aat', width: 110,
      render: (v:number) => <strong>¥{Number(v||0).toLocaleString()}</strong> },
    {
      title: '操作', key: 'act', width: 60, fixed: 'right' as const,
      render: (_:any, r:any) => <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => handleSave(r)}>保存</Button>,
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <span>月份：</span>
          <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 200 }} />
        </Space>
      </Card>
      <Table
        columns={columns}
        dataSource={records}
        loading={loading}
        scroll={{ x: 2400 }}
        size="small"
        pagination={{ pageSize: 50 }}
      />
    </div>
  );
};

export default AttendancePage;
