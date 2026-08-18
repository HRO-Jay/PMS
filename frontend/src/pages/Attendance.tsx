import React, { useEffect, useState } from 'react';
import {
  Table, Card, Button, Space, Input, message, InputNumber, Upload, Popconfirm, Drawer, Tag, Descriptions, Select, DatePicker, Form,
} from 'antd';
import { SaveOutlined, DownloadOutlined, UploadOutlined, CalculatorOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../api/client';
import { exportXlsx, importXlsx, type ExportDef } from '../utils/importExport';
import { calcAttendance } from '../utils/attendanceCalc';
import { withSource } from '../components/SourceTag';
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
        api.get('/employees?select=unique_hash,name,status,cost_center,pay_company,tax_method,department,report_to,position,job_level,attendance_type,entry_date,leave_date,basic_salary'),
        api.get(`/attendance_records?select=*&period=eq.${period}&order=unique_hash`),
      ]);
      // 员工列表（含基本工资）
      const empList: any[] = empRes.data;
      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });
      setEmployees(empMap);

      // 当月考勤记录映射
      const recMap: Record<string, any> = {};
      recRes.data.forEach((r: any) => { recMap[r.unique_hash] = r; });

      // 左连接：以花名册员工为准，自动列出所有人（在职全显 + 离职但当月有记录也显示）
      const merged = empList
        .filter((e: any) => e.status === '在职' || recMap[e.unique_hash])
        .map((e: any) => {
          const rec = recMap[e.unique_hash];
          return {
            // 基础信息来自花名册
            unique_hash: e.unique_hash,
            employee_name: e.name,
            status: e.status || '',
            pay_company: e.pay_company || '',
            cost_center: e.cost_center || '',
            department: e.department || '',
            report_to: e.report_to || '',
            position: e.position || '',
            entry_date: e.entry_date || '',
            leave_date: e.leave_date || '',
            attendance_type: e.attendance_type || '',
            tax_method: e.tax_method || '',
            job_level: e.job_level || '',
            // 基本工资优先取考勤记录，否则取花名册
            basic_salary: rec?.basic_salary ?? e.basic_salary ?? undefined,
            // 业务数据来自考勤记录（无记录则空）
            ...(rec || {
              id: undefined,
              pay_days: undefined,
              sick_days: 0, personal_days: 0, annual_leave: 0, compensatory_leave: 0,
              absenteeism_days: 0, funeral_leave: 0, parental_leave: 0, marriage_leave: 0,
              maternity_leave: 0, overtime_type: undefined, overtime_unit: '天', overtime_qty: 0,
              sick_amount: 0, personal_amount: 0, absenteeism_amount: 0, overtime_amount: 0,
              on_off_adjust: 0, attendance_adjust_total: 0, data_status: '未录入',
            }),
            key: rec?.id ?? `emp-${e.unique_hash}`,
          };
        });

      setRecords(merged);
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
        const calcFields = {
          sick_pay_rate: result.sick_pay_rate,
          sick_amount: result.sick_amount,
          personal_amount: result.personal_amount,
          absenteeism_amount: result.absenteeism_amount,
          overtime_amount: result.overtime_amount,
          on_off_adjust: result.on_off_adjust,
          attendance_adjust_total: result.attendance_adjust_total,
          data_status: '已计算',
        };
        const existing = await api.get(`/attendance_records?unique_hash=eq.${r.unique_hash}&period=eq.${period}`);
        if (existing.data.length > 0) {
          await api.patch(`/attendance_records?id=eq.${existing.data[0].id}`, calcFields);
        } else {
          await api.post('/attendance_records', {
            unique_hash: r.unique_hash, period, ...calcFields,
          });
        }
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
      const payload = {
        unique_hash: record.unique_hash,
        period,
        basic_salary: record.basic_salary,
        pay_days: record.pay_days,
        sick_days: record.sick_days, personal_days: record.personal_days,
        annual_leave: record.annual_leave, compensatory_leave: record.compensatory_leave,
        absenteeism_days: record.absenteeism_days, funeral_leave: record.funeral_leave,
        parental_leave: record.parental_leave, marriage_leave: record.marriage_leave,
        maternity_leave: record.maternity_leave,
        overtime_type: record.overtime_type, overtime_unit: record.overtime_unit,
        overtime_qty: record.overtime_qty, hourly_rate: record.hourly_rate,
        holiday_fixed_amount: record.holiday_fixed_amount,
        actual_attendance_days: record.actual_attendance_days,
        sick_pay_rate: result.sick_pay_rate,
        sick_amount: result.sick_amount,
        personal_amount: result.personal_amount,
        absenteeism_amount: result.absenteeism_amount,
        overtime_amount: result.overtime_amount,
        on_off_adjust: result.on_off_adjust,
        attendance_adjust_total: result.attendance_adjust_total,
        data_status: '已计算',
      };
      const existing = await api.get(`/attendance_records?unique_hash=eq.${record.unique_hash}&period=eq.${period}`);
      if (existing.data.length > 0) {
        await api.patch(`/attendance_records?id=eq.${existing.data[0].id}`, payload);
      } else {
        await api.post('/attendance_records', payload);
      }
      message.success('保存成功');
      loadData();
    } catch {
      message.error('保存失败');
    }
  };

  const updateCell = (key: string, field: string, value: any) => {
    setRecords(prev => prev.map(r => r.key === key ? { ...r, [field]: value ?? 0 } : r));
  };

  const openDetail = (r: any) => {
    setDetailRecord(r);
    setDetailOpen(true);
  };

  const openAdd = () => {
    setAddForm({});
    setAddOpen(true);
  };

  // 添加记录保存
  const handleAddSave = async () => {
    if (!addForm.unique_hash) {
      message.warning('请先选择员工');
      return;
    }
    if (!addForm.pay_days) {
      message.warning('请填写计薪天数');
      return;
    }
    try {
      await api.post('/attendance_records', {
        ...addForm,
        period,
        data_status: '草稿',
      });
      message.success('添加成功');
      setAddOpen(false);
      setAddForm({});
      loadData();
    } catch (e: any) {
      message.error(e.response?.data?.message || '添加失败');
    }
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
    { title: withSource('姓名', '花名册同步'), dataIndex: 'employee_name', key: 'name', width: 90, fixed: 'left' },
    { title: withSource('发薪公司', '花名册同步'), dataIndex: 'pay_company', key: 'co', width: 140, ellipsis: true, fixed: 'left' },
    { title: withSource('成本中心', '花名册同步'), dataIndex: 'cost_center', key: 'cc', width: 90 },
    { title: withSource('部门', '花名册同步'), dataIndex: 'department', key: 'dept', width: 90 },
    { title: withSource('汇报人', '花名册同步'), dataIndex: 'report_to', key: 'rpt', width: 80 },
    { title: withSource('职位', '花名册同步'), dataIndex: 'position', key: 'pos', width: 90 },
    { title: withSource('入职日期', '花名册同步'), dataIndex: 'entry_date', key: 'jd', width: 100 },
    { title: withSource('考勤制', '花名册同步'), dataIndex: 'attendance_type', key: 'ws', width: 100 },
    { title: withSource('基本工资', '花名册同步'), dataIndex: 'basic_salary', key: 'bs', width: 100,
      render: (v: number, r: any) => <InputNumber size="small" value={v} style={{ width: 90 }} onChange={val => updateCell(r.key, 'basic_salary', val)} /> },
    { title: withSource('计薪天数', '手动录入'), dataIndex: 'pay_days', key: 'pd', width: 90,
      render: (v: number, r: any) => <InputNumber size="small" value={v} style={{ width: 70 }} onChange={val => updateCell(r.key, 'pay_days', val)} /> },
    { title: withSource('病假(天)', '导入'), dataIndex: 'sick_days', key: 'sd', width: 80,
      render: (v: number, r: any) => <InputNumber size="small" min={0} value={v} style={{ width: 60 }} onChange={val => updateCell(r.key, 'sick_days', val)} /> },
    { title: withSource('病假金额', '系统计算'), dataIndex: 'sick_amount', key: 'sa', width: 90, render: (v: number) => fmtMoney(v) },
    { title: withSource('事假(天)', '导入'), dataIndex: 'personal_days', key: 'pd2', width: 80,
      render: (v: number, r: any) => <InputNumber size="small" min={0} value={v} style={{ width: 60 }} onChange={val => updateCell(r.key, 'personal_days', val)} /> },
    { title: withSource('事假金额', '系统计算'), dataIndex: 'personal_amount', key: 'pa', width: 90, render: (v: number) => fmtMoney(v) },
    { title: withSource('旷工(天)', '导入'), dataIndex: 'absenteeism_days', key: 'ad', width: 80,
      render: (v: number, r: any) => <InputNumber size="small" min={0} value={v} style={{ width: 60 }} onChange={val => updateCell(r.key, 'absenteeism_days', val)} /> },
    { title: withSource('加班金额', '系统计算'), dataIndex: 'overtime_amount', key: 'oa', width: 90, render: (v: number) => fmtMoney(v) },
    { title: withSource('入离职调整', '系统计算'), dataIndex: 'on_off_adjust', key: 'oof', width: 100, render: (v: number) => fmtMoney(v) },
    { title: withSource('考勤调整合计', '系统计算'), dataIndex: 'attendance_adjust_total', key: 'aat', width: 110, fixed: 'right',
      render: (v: number) => <strong style={{ color: v < 0 ? '#e74c3c' : '#27ae60' }}>{fmtMoney(v)}</strong> },
    { title: withSource('数据状态', '系统计算'), dataIndex: 'data_status', key: 'ds', width: 100,
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
          <Button icon={<PlusOutlined />} onClick={openAdd}>添加记录</Button>
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

      {/* 添加记录抽屉 */}
      <Drawer
        title="添加考勤记录"
        open={addOpen}
        onClose={() => setAddOpen(false)}
        width={560}
        extra={
          <Space>
            <Button onClick={() => setAddOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleAddSave}>保存</Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Form.Item label="员工" required>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="从花名册选择员工"
              value={addForm.unique_hash}
              onChange={(v) => {
                const emp = Object.values(employees).find((e: any) => e.unique_hash === v);
                setAddForm({ ...addForm, unique_hash: v, employee_name: emp?.name, pay_company: emp?.pay_company });
              }}
              options={Object.values(employees).map((e: any) => ({ value: e.unique_hash, label: `${e.name} — ${e.pay_company}` }))}
            />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="基本工资">
              <InputNumber style={{ width: 160 }} value={addForm.basic_salary} onChange={(v) => setAddForm({ ...addForm, basic_salary: v })} />
            </Form.Item>
            <Form.Item label="计薪天数" required>
              <InputNumber style={{ width: 160 }} min={0} value={addForm.pay_days} onChange={(v) => setAddForm({ ...addForm, pay_days: v })} placeholder="21.75/26/30" />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="病假(天)">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.sick_days} onChange={(v) => setAddForm({ ...addForm, sick_days: v })} />
            </Form.Item>
            <Form.Item label="事假(天)">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.personal_days} onChange={(v) => setAddForm({ ...addForm, personal_days: v })} />
            </Form.Item>
            <Form.Item label="旷工(天)">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.absenteeism_days} onChange={(v) => setAddForm({ ...addForm, absenteeism_days: v })} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="年假">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.annual_leave} onChange={(v) => setAddForm({ ...addForm, annual_leave: v })} />
            </Form.Item>
            <Form.Item label="调休">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.compensatory_leave} onChange={(v) => setAddForm({ ...addForm, compensatory_leave: v })} />
            </Form.Item>
            <Form.Item label="加班数量">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.overtime_qty} onChange={(v) => setAddForm({ ...addForm, overtime_qty: v })} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="加班类型">
              <Select style={{ width: 160 }} allowClear value={addForm.overtime_type} onChange={(v) => setAddForm({ ...addForm, overtime_type: v })}
                options={['平时加班', '周末加班', '法定节假日加班'].map(t => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item label="加班单位">
              <Select style={{ width: 120 }} allowClear value={addForm.overtime_unit} onChange={(v) => setAddForm({ ...addForm, overtime_unit: v })}
                options={[{ value: '天', label: '天' }, { value: '小时', label: '小时' }]} />
            </Form.Item>
          </Space>
          <Form.Item label="备注">
            <Input.TextArea rows={2} value={addForm.remark} onChange={(e) => setAddForm({ ...addForm, remark: e.target.value })} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default AttendancePage;
