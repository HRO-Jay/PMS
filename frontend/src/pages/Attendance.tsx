import React, { useEffect, useState } from 'react';
import {
  Table, Card, Button, Space, Input, message, InputNumber, Upload, Popconfirm, Drawer, Tag, Descriptions, Select, DatePicker,
} from 'antd';
import { SaveOutlined, DownloadOutlined, UploadOutlined, CalculatorOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../api/client';
import { exportXlsx, importXlsx, type ExportDef } from '../utils/importExport';
import { calcAttendance } from '../utils/attendanceCalc';
import dayjs from 'dayjs';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '') return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头
const EXPORT_DEF: ExportDef = {
  module: '考勤管理',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: true },
    { key: 'basic_salary', label: '基本工资' },
    { key: 'pay_days', label: '计薪天数', required: true },
    { key: 'sick_days', label: '病假(天)' },
    { key: 'is_continuous_sick', label: '是否连续病假' },
    { key: 'continuous_sick_start', label: '连续病假开始日期' },
    { key: 'continuous_sick_end', label: '连续病假结束日期' },
    { key: 'personal_days', label: '事假(天)' },
    { key: 'annual_leave', label: '年假' },
    { key: 'compensatory_leave', label: '调休' },
    { key: 'absenteeism_days', label: '旷工(天)' },
    { key: 'funeral_leave', label: '丧假' },
    { key: 'parental_leave', label: '育儿假' },
    { key: 'marriage_leave', label: '婚假' },
    { key: 'maternity_leave', label: '产假' },
    { key: 'overtime_type', label: '加班类型' },
    { key: 'overtime_unit', label: '加班单位' },
    { key: 'overtime_qty', label: '加班数量' },
    { key: 'hourly_rate', label: '时薪' },
    { key: 'holiday_fixed_amount', label: '法定节假日固定金额' },
    { key: 'actual_attendance_days', label: '实际出勤天数' },
    { key: 'transfer_date', label: '发薪公司转移日期' },
    { key: 'remark', label: '备注' },
  ],
};

const AttendancePage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, any>>({});
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<any>({});

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, recRes] = await Promise.all([
        api.get('/employees?select=unique_hash,name,status,cost_center,pay_company,tax_method,department,report_to,position,job_level,attendance_type,entry_date,leave_date'),
        api.get(`/attendance_records?select=*&period=eq.${period}&order=unique_hash`),
      ]);
      const empMap: Record<string, any> = {};
      empRes.data.forEach((e: any) => { empMap[e.unique_hash] = e; });

      setRecords(recRes.data.map((r: any) => {
        const emp = empMap[r.unique_hash] || {};
        return {
          ...r,
          key: r.id,
          employee_name: emp.name || r.unique_hash,
          status: emp.status || '',
          pay_company: emp.pay_company || '',
          cost_center: emp.cost_center || '',
          department: emp.department || '',
          report_to: emp.report_to || '',
          position: emp.position || '',
          entry_date: emp.entry_date || '',
          leave_date: emp.leave_date || '',
          attendance_type: emp.attendance_type || '',
          tax_method: emp.tax_method || '',
          job_level: emp.job_level || '',
        };
      }));
    } catch { message.error('加载考勤数据失败'); }
    finally { setLoading(false); }
  };

  // 自动计算某条记录
  const calcRecord = (r: any) => {
    const result = calcAttendance({
      entry_date: r.entry_date,
      period,
      basic_salary: r.basic_salary,
      pay_days: r.pay_days,
      sick_days: r.sick_days,
      is_continuous_sick: r.is_continuous_sick,
      continuous_sick_start: r.continuous_sick_start,
      continuous_sick_end: r.continuous_sick_end,
      personal_days: r.personal_days,
      absenteeism_days: r.absenteeism_days,
      overtime_type: r.overtime_type,
      overtime_unit: r.overtime_unit,
      overtime_qty: r.overtime_qty,
      hourly_rate: r.hourly_rate,
      holiday_fixed_amount: r.holiday_fixed_amount,
      position: r.position,
      actual_attendance_days: r.actual_attendance_days,
      special_adjust_amount: r.special_adjust_amount,
    });
    return result;
  };

  // 全部自动计算
  const handleAutoCalc = async () => {
    let success = 0;
    for (const r of records) {
      try {
        const result = calcRecord(r);
        await api.patch(`/attendance_records?id=eq.${r.id}`, {
          sick_pay_rate: result.sick_pay_rate,
          sick_amount: result.sick_amount,
          personal_amount: result.personal_amount,
          absenteeism_amount: result.absenteeism_amount,
          overtime_amount: result.overtime_amount,
          on_off_adjust: result.on_off_adjust,
          attendance_adjust_total: result.attendance_adjust_total,
          data_status: '已计算',
        });
        success++;
      } catch { /* skip */ }
    }
    message.success(`计算完成：${success} / ${records.length} 条`);
    loadData();
  };

  // 单条保存
  const handleSave = async (record: any) => {
    try {
      const result = calcRecord(record);
      await api.post('/attendance_records', {
        ...record,
        period,
        sick_pay_rate: result.sick_pay_rate,
        sick_amount: result.sick_amount,
        personal_amount: result.personal_amount,
        absenteeism_amount: result.absenteeism_amount,
        overtime_amount: result.overtime_amount,
        on_off_adjust: result.on_off_adjust,
        attendance_adjust_total: result.attendance_adjust_total,
        data_status: '已计算',
      });
      message.success('保存成功');
      loadData();
    } catch {
      // 已存在则更新
      try {
        const result = calcRecord(record);
        await api.patch(`/attendance_records?unique_hash=eq.${record.unique_hash}&period=eq.${period}`, {
          ...record,
          sick_pay_rate: result.sick_pay_rate,
          sick_amount: result.sick_amount,
          personal_amount: result.personal_amount,
          absenteeism_amount: result.absenteeism_amount,
          overtime_amount: result.overtime_amount,
          on_off_adjust: result.on_off_adjust,
          attendance_adjust_total: result.attendance_adjust_total,
          data_status: '已计算',
        });
        message.success('更新成功');
        loadData();
      } catch {
        message.error('保存失败');
      }
    }
  };

  const updateCell = (id: number, field: string, value: any) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: value ?? 0 } : r));
  };

  const openDetail = (r: any) => {
    setDetailRecord(r);
    setDetailOpen(true);
  };

  const openAdd = () => {
    setAddForm({});
    setAddOpen(true);
  };

  // 导出
  const handleExport = () => exportXlsx(EXPORT_DEF, records, period);

  // 导入
  const handleImport = async (file: File) => {
    try {
      const { data, import_errors } = await importXlsx(EXPORT_DEF, file);
      if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
      if (data.length === 0) { message.info('未找到有效数据'); return; }
      let success = 0;
      for (const row of data) {
        try {
          if (!row.unique_hash) { continue; }
          const existing = await api.get(`/attendance_records?unique_hash=eq.${row.unique_hash}&period=eq.${period}`);
          const payload = { ...row, period };
          if (existing.data.length > 0) {
            await api.patch(`/attendance_records?id=eq.${existing.data[0].id}`, payload);
          } else {
            await api.post('/attendance_records', payload);
          }
          success++;
        } catch { /* skip */ }
      }
      message.success(`导入完成：${success} / ${data.length} 条`);
      loadData();
    } catch (e: any) {
      message.error(e.message || '导入失败');
    }
  };

  // 汇总卡片
  const summary = {
    count: records.length,
    sickDays: records.reduce((s, r) => s + (r.sick_days || 0), 0),
    personalDays: records.reduce((s, r) => s + (r.personal_days || 0), 0),
    annualLeave: records.reduce((s, r) => s + (r.annual_leave || 0), 0),
    compensatory: records.reduce((s, r) => s + (r.compensatory_leave || 0), 0),
    absenteeism: records.reduce((s, r) => s + (r.absenteeism_days || 0), 0),
    overtime: records.reduce((s, r) => s + (r.overtime_qty || 0), 0),
    deductAmount: records.reduce((s, r) => s + (r.sick_amount || 0) + (r.personal_amount || 0) + (r.absenteeism_amount || 0), 0),
    addAmount: records.reduce((s, r) => s + (r.overtime_amount || 0) + (r.special_adjust_amount || 0), 0),
    netTotal: records.reduce((s, r) => s + (r.attendance_adjust_total || 0), 0),
  };

  const columns: any[] = [
    { title: '姓名', dataIndex: 'employee_name', key: 'name', width: 90, fixed: 'left' },
    { title: '发薪公司', dataIndex: 'pay_company', key: 'co', width: 140, ellipsis: true, fixed: 'left' },
    { title: '成本中心', dataIndex: 'cost_center', key: 'cc', width: 90 },
    { title: '部门', dataIndex: 'department', key: 'dept', width: 90 },
    { title: '汇报人', dataIndex: 'report_to', key: 'rpt', width: 80 },
    { title: '职位', dataIndex: 'position', key: 'pos', width: 90 },
    { title: '入职日期', dataIndex: 'entry_date', key: 'jd', width: 100 },
    { title: '考勤制', dataIndex: 'attendance_type', key: 'ws', width: 100 },
    { title: '基本工资', dataIndex: 'basic_salary', key: 'bs', width: 100,
      render: (v: number, r: any) => <InputNumber size="small" value={v} style={{ width: 90 }} onChange={val => updateCell(r.id, 'basic_salary', val)} /> },
    { title: '计薪天数', dataIndex: 'pay_days', key: 'pd', width: 90,
      render: (v: number, r: any) => <InputNumber size="small" value={v} style={{ width: 70 }} onChange={val => updateCell(r.id, 'pay_days', val)} /> },
    { title: '病假(天)', dataIndex: 'sick_days', key: 'sd', width: 80,
      render: (v: number, r: any) => <InputNumber size="small" min={0} value={v} style={{ width: 60 }} onChange={val => updateCell(r.id, 'sick_days', val)} /> },
    { title: '病假金额', dataIndex: 'sick_amount', key: 'sa', width: 90, render: (v: number) => fmtMoney(v) },
    { title: '事假(天)', dataIndex: 'personal_days', key: 'pd2', width: 80,
      render: (v: number, r: any) => <InputNumber size="small" min={0} value={v} style={{ width: 60 }} onChange={val => updateCell(r.id, 'personal_days', val)} /> },
    { title: '事假金额', dataIndex: 'personal_amount', key: 'pa', width: 90, render: (v: number) => fmtMoney(v) },
    { title: '旷工(天)', dataIndex: 'absenteeism_days', key: 'ad', width: 80,
      render: (v: number, r: any) => <InputNumber size="small" min={0} value={v} style={{ width: 60 }} onChange={val => updateCell(r.id, 'absenteeism_days', val)} /> },
    { title: '加班金额', dataIndex: 'overtime_amount', key: 'oa', width: 90, render: (v: number) => fmtMoney(v) },
    { title: '入离职调整', dataIndex: 'on_off_adjust', key: 'oof', width: 100, render: (v: number) => fmtMoney(v) },
    { title: '考勤调整合计', dataIndex: 'attendance_adjust_total', key: 'aat', width: 110, fixed: 'right',
      render: (v: number) => <strong style={{ color: v < 0 ? '#e74c3c' : '#27ae60' }}>{fmtMoney(v)}</strong> },
    { title: '数据状态', dataIndex: 'data_status', key: 'ds', width: 100,
      render: (v: string) => <Tag color={v === '已锁定' ? 'red' : v === '草稿' ? 'default' : 'blue'}>{v}</Tag> },
    {
      title: '操作', key: 'act', width: 150, fixed: 'right',
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" onClick={() => openDetail(r)}>查看</Button>
          <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => handleSave(r)}>保存</Button>
          <Popconfirm title="确认删除该考勤记录？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
            onConfirm={async () => { await api.delete(`/attendance_records?id=eq.${r.id}`); message.success('已删除'); loadData(); }}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <span>月份：</span>
          <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 180 }} />
          <Button type="primary" icon={<CalculatorOutlined />} onClick={handleAutoCalc}>自动计算</Button>
          <Button icon={<PlusOutlined />} onClick={openAdd}>单独新增</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { handleImport(file); return false; }}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
        </Space>
      </Card>

      {/* 汇总卡片 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size="large" wrap>
          <span>员工人数：<strong>{summary.count}</strong></span>
          <span>病假天数：<strong>{summary.sickDays}</strong></span>
          <span>事假天数：<strong>{summary.personalDays}</strong></span>
          <span>旷工天数：<strong>{summary.absenteeism}</strong></span>
          <span>加班：<strong>{summary.overtime}</strong></span>
          <span>扣款合计：<strong style={{ color: '#e74c3c' }}>{fmtMoney(summary.deductAmount)}</strong></span>
          <span>增发合计：<strong style={{ color: '#27ae60' }}>{fmtMoney(summary.addAmount)}</strong></span>
          <span>考勤调整净额：<strong style={{ color: summary.netTotal < 0 ? '#e74c3c' : '#27ae60' }}>{fmtMoney(summary.netTotal)}</strong></span>
        </Space>
      </Card>

      <Table columns={columns} dataSource={records} loading={loading} scroll={{ x: 2400 }} size="small" pagination={{ pageSize: 50 }} />

      {/* 详情抽屉 */}
      <Drawer title="考勤详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={680}>
        {detailRecord && (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="姓名">{detailRecord.employee_name}</Descriptions.Item>
            <Descriptions.Item label="发薪公司">{detailRecord.pay_company}</Descriptions.Item>
            <Descriptions.Item label="基本工资">{fmtMoney(detailRecord.basic_salary)}</Descriptions.Item>
            <Descriptions.Item label="计薪天数">{detailRecord.pay_days}</Descriptions.Item>
            <Descriptions.Item label="病假天数">{detailRecord.sick_days}</Descriptions.Item>
            <Descriptions.Item label="病假金额">{fmtMoney(detailRecord.sick_amount)}</Descriptions.Item>
            <Descriptions.Item label="事假天数">{detailRecord.personal_days}</Descriptions.Item>
            <Descriptions.Item label="事假金额">{fmtMoney(detailRecord.personal_amount)}</Descriptions.Item>
            <Descriptions.Item label="旷工天数">{detailRecord.absenteeism_days}</Descriptions.Item>
            <Descriptions.Item label="旷工金额">{fmtMoney(detailRecord.absenteeism_amount)}</Descriptions.Item>
            <Descriptions.Item label="加班金额">{fmtMoney(detailRecord.overtime_amount)}</Descriptions.Item>
            <Descriptions.Item label="入离职调整">{fmtMoney(detailRecord.on_off_adjust)}</Descriptions.Item>
            <Descriptions.Item label="考勤调整合计" span={2}>
              <strong>{fmtMoney(detailRecord.attendance_adjust_total)}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="数据状态" span={2}>{detailRecord.data_status}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default AttendancePage;
