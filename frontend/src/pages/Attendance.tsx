import React, { useEffect, useState } from 'react';
import {
  Table, Card, Button, Space, Input, message, InputNumber, Upload, Popconfirm, Drawer, Tag, Descriptions, Select, DatePicker, Form, Dropdown,
} from 'antd';
import { SaveOutlined, DownloadOutlined, UploadOutlined, CalculatorOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { exportXlsx, importXlsx, type ExportDef } from '../utils/importExport';
import { calcAttendance, parseAttendanceRules, type AttendanceRules, DEFAULT_ATTENDANCE_RULES } from '../utils/attendanceCalc';
import { withSource } from '../components/SourceTag';
import { useHorizontalScroll } from '../utils/useHorizontalScroll';
import dayjs from 'dayjs';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头
const EXPORT_DEF: ExportDef = {
  module: '考勤管理',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    // 花名册同步字段（导出带出）
    { key: 'employee_name', label: '姓名' },
    { key: 'pay_company', label: '发薪公司' },
    { key: 'cost_center', label: '成本中心' },
    { key: 'department', label: '部门' },
    { key: 'report_to', label: '汇报人' },
    { key: 'position', label: '职位' },
    { key: 'attendance_type', label: '考勤制' },
    { key: 'entry_date', label: '入职日期' },
    // 考勤业务字段
    { key: 'basic_salary', label: '基本工资' },
    { key: 'attendance_wage', label: '考勤工资' },
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
    { key: 'regular_overtime_days', label: '平时加班(天)' },
    { key: 'weekend_overtime_days', label: '周末加班(天)' },
    { key: 'holiday_overtime_days', label: '节假日加班(天)' },
    { key: 'overtime_hours', label: '延时加班(小时)' },
    { key: 'hourly_rate', label: '时薪' },
    { key: 'holiday_fixed_amount', label: '法定节假日固定金额' },
    { key: 'actual_attendance_days', label: '实际出勤天数' },
    { key: 'transfer_date', label: '发薪公司转移日期' },
    { key: 'remark', label: '备注' },
  ],
};

const AttendancePage: React.FC = () => {
  const navigate = useNavigate();
  const { ref: scrollRef, onWheel } = useHorizontalScroll<HTMLDivElement>();
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, any>>({});
  const [attRules, setAttRules] = useState<AttendanceRules>(DEFAULT_ATTENDANCE_RULES);
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<any>({});
  // 特殊调整
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjForm, setAdjForm] = useState<any>({});
  const [adjustments, setAdjustments] = useState<any[]>([]);

  // 筛选器状态
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fCostCenter, setFCostCenter] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();
  const [fReportTo, setFReportTo] = useState<string>();
  const [fAttType, setFAttType] = useState<string>();
  const [fPayDays, setFPayDays] = useState<string>();
  const [fStatus, setFStatus] = useState<string>();
  const [fAbnormal, setFAbnormal] = useState<string>();
  const [keyword, setKeyword] = useState('');

  // 列设置：可选列（默认隐藏，勾选后显示）
  const [visibleOptionalCols, setVisibleOptionalCols] = useState<string[]>([]);
  const [colSettingOpen, setColSettingOpen] = useState(false);

  useEffect(() => { loadData(); }, [period, fPayCompany, fCostCenter, fDepartment, fReportTo, fAttType, fPayDays, fStatus, fAbnormal, keyword]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, recRes, adjRes, rulesRes] = await Promise.all([
        api.get('/employees?select=unique_hash,name,status,cost_center,pay_company,tax_method,department,report_to,position,job_level,attendance_type,entry_date,leave_date,basic_salary'),
        api.get(`/attendance_records?select=*&period=eq.${period}&order=unique_hash`),
        api.get(`/attendance_adjustments?select=*&period=eq.${period}`),
        api.get('/attendance_rules?select=*'),
      ]);
      setAdjustments(adjRes.data);
      // 考勤计算规则：优先读数据库 attendance_rules，缺省回退内置默认
      const rules = parseAttendanceRules(rulesRes.data);
      setAttRules(rules);
      // 员工列表（含基本工资）
      const empList: any[] = empRes.data;
      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });
      setEmployees(empMap);

      // 当月考勤记录映射
      const recMap: Record<string, any> = {};
      recRes.data.forEach((r: any) => { recMap[r.unique_hash] = r; });

      // 特殊调整按员工汇总金额
      const adjSumMap: Record<string, number> = {};
      adjustments.forEach((a: any) => {
        const amount = a.fixed_amount !== undefined && a.fixed_amount !== null
          ? Number(a.fixed_amount)
          : Number(a.adjust_base || 0) * Number(a.adjust_qty || 0) * Number(a.adjust_ratio || 1);
        const signed = a.direction === '扣减' ? -Math.abs(amount) : Math.abs(amount);
        adjSumMap[a.unique_hash] = Number(((adjSumMap[a.unique_hash] || 0) + signed).toFixed(2));
      });

      // 左连接：以花名册员工为准，自动列出所有人（在职全显 + 离职但当月有记录也显示）
      const merged = empList
        .filter((e: any) => e.status === '在职' || recMap[e.unique_hash] || adjSumMap[e.unique_hash])
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
            // 业务数据来自考勤记录（无记录则空）
            ...(rec || {
              id: undefined,
              pay_days: undefined,
              sick_days: 0, personal_days: 0, annual_leave: 0, compensatory_leave: 0,
              absenteeism_days: 0, funeral_leave: 0, parental_leave: 0, marriage_leave: 0,
              maternity_leave: 0, regular_overtime_days: 0, weekend_overtime_days: 0,
              holiday_overtime_days: 0, overtime_hours: 0,
              sick_amount: 0, personal_amount: 0, absenteeism_amount: 0, overtime_amount: 0,
              on_off_adjust: 0, attendance_adjust_total: 0, data_status: '未录入',
            }),
            key: rec?.id ?? `emp-${e.unique_hash}`,
            // 基本工资优先取考勤记录，否则取花名册（仅供展示，不参与计算）
            basic_salary: rec?.basic_salary ?? e.basic_salary ?? undefined,
            // 以下必须在考勤记录展开之后再赋值，避免被记录里的空值覆盖成横杠
            // 考勤工资来自考勤记录导入
            attendance_wage: rec?.attendance_wage ?? undefined,
            // 特殊调整金额
            special_adjust_amount: adjSumMap[e.unique_hash] || 0,
          };
        });

      // 前端筛选（同时计算工龄、日薪、病假系数、异常状态供可选列展示）
      let filtered = merged.map((r: any) => {
        const calc = calcRecord(r, rules);
        const validPayDays = rules.pay_days_options.length ? rules.pay_days_options : [21.75, 26, 30];
        const pd = Number(r.pay_days);
        let abnormal = '正常';
        if (pd && !validPayDays.includes(pd)) abnormal = '异常';
        else if ((Number(r.sick_days) || 0) > 0 && r.is_continuous_sick === true && (!r.continuous_sick_start || !r.continuous_sick_end)) abnormal = '异常';
        else if ((Number(r.overtime_hours) || 0) > 0 && !r.hourly_rate) abnormal = '异常';
        return {
          ...r,
          abnormal,
          seniority: calc.seniority_years,
          daily_wage: calc.daily_wage,
          sick_pay_rate: calc.sick_pay_rate,
        };
      });
      if (fPayCompany) filtered = filtered.filter((r: any) => r.pay_company === fPayCompany);
      if (fCostCenter) filtered = filtered.filter((r: any) => (r.cost_center || '').includes(fCostCenter));
      if (fDepartment) filtered = filtered.filter((r: any) => (r.department || '').includes(fDepartment));
      if (fReportTo) filtered = filtered.filter((r: any) => (r.report_to || '').includes(fReportTo));
      if (fAttType) filtered = filtered.filter((r: any) => r.attendance_type === fAttType);
      if (fPayDays) filtered = filtered.filter((r: any) => String(r.pay_days) === fPayDays);
      if (fStatus) filtered = filtered.filter((r: any) => r.data_status === fStatus);
      if (fAbnormal === '仅异常') filtered = filtered.filter((r: any) => r.abnormal === '异常');
      if (fAbnormal === '仅正常') filtered = filtered.filter((r: any) => r.abnormal === '正常');
      if (keyword) filtered = filtered.filter((r: any) => (r.employee_name || '').includes(keyword));

      setRecords(filtered);
    } catch { message.error('加载考勤数据失败'); }
    finally { setLoading(false); }
  };

  // 自动计算某条记录（rules 由调用方传入，避免异步 state 时序问题）
  const calcRecord = (r: any, rules: AttendanceRules = attRules) => {
    const result = calcAttendance({
      entry_date: r.entry_date,
      period,
      attendance_wage: r.attendance_wage,
      pay_days: r.pay_days,
      rules,
      sick_days: r.sick_days,
      is_continuous_sick: r.is_continuous_sick,
      continuous_sick_start: r.continuous_sick_start,
      continuous_sick_end: r.continuous_sick_end,
      personal_days: r.personal_days,
      absenteeism_days: r.absenteeism_days,
      regular_overtime_days: r.regular_overtime_days,
      weekend_overtime_days: r.weekend_overtime_days,
      holiday_overtime_days: r.holiday_overtime_days,
      overtime_hours: r.overtime_hours,
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
    // 计薪天数校验（按规则表里的选项）
    const validPayDays = attRules.pay_days_options.length ? attRules.pay_days_options : [21.75, 26, 30];
    let invalidCount = 0;
    for (const r of records) {
      if (r.pay_days !== undefined && r.pay_days !== null && !validPayDays.includes(Number(r.pay_days))) {
        invalidCount++;
      }
    }
    if (invalidCount > 0) {
      message.warning(`有 ${invalidCount} 条记录计薪天数不在规则选项内，请先修正`);
      return;
    }

    let success = 0;
    for (const r of records) {
      if (r.data_status === '已锁定') continue;  // 已锁定跳过
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
        attendance_wage: record.attendance_wage,
        pay_days: record.pay_days,
        sick_days: record.sick_days, personal_days: record.personal_days,
        annual_leave: record.annual_leave, compensatory_leave: record.compensatory_leave,
        absenteeism_days: record.absenteeism_days, funeral_leave: record.funeral_leave,
        parental_leave: record.parental_leave, marriage_leave: record.marriage_leave,
        maternity_leave: record.maternity_leave,
        regular_overtime_days: record.regular_overtime_days, weekend_overtime_days: record.weekend_overtime_days,
        holiday_overtime_days: record.holiday_overtime_days, overtime_hours: record.overtime_hours,
        hourly_rate: record.hourly_rate,
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

  // 打开编辑抽屉
  const openEdit = (r: any) => {
    setAddForm({ ...r });
    setAddOpen(true);
  };

  // 打开特殊调整抽屉
  const openAdjust = () => {
    setAdjForm({ direction: '增发', currency: '人民币' });
    setAdjOpen(true);
  };

  // 保存特殊调整
  const handleAdjSave = async () => {
    if (!adjForm.unique_hash) { message.warning('请选择员工'); return; }
    if (!adjForm.adjust_type) { message.warning('请选择调整类型'); return; }
    if (!adjForm.reason) { message.warning('请填写调整原因'); return; }
    try {
      await api.post('/attendance_adjustments', { ...adjForm, period });
      message.success('特殊调整已保存');
      setAdjOpen(false);
      setAdjForm({});
      loadData();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  // 特殊调整导入/导出表头
  const ADJ_EXPORT_DEF: ExportDef = {
    module: '特殊调整',
    columns: [
      { key: 'name', label: '姓名', required: true },
      { key: 'pay_company', label: '发薪公司', required: true },
      { key: 'adjust_type', label: '调整类型', required: true },
      { key: 'adjust_base', label: '调整基数' },
      { key: 'adjust_qty', label: '调整数量' },
      { key: 'adjust_ratio', label: '绩效/计发比例' },
      { key: 'fixed_amount', label: '固定调整金额' },
      { key: 'direction', label: '调整方向', required: true },
      { key: 'reason', label: '调整原因', required: true },
      { key: 'attachment_note', label: '备注' },
    ],
  };

  // 特殊调整导出（直接导出当前特殊调整记录，带姓名公司）
  const handleAdjExport = () => {
    const adjWithEmp = adjustments.map((a: any) => {
      const emp = Object.values(employees).find((e: any) => e.unique_hash === a.unique_hash);
      return {
        ...a,
        name: emp?.name || '',
        pay_company: emp?.pay_company || '',
      };
    });
    exportXlsx(ADJ_EXPORT_DEF, adjWithEmp, period);
  };

  // 特殊调整批量导入
  const handleAdjImport = async (file: File) => {
    try {
      const { data, import_errors } = await importXlsx(ADJ_EXPORT_DEF, file);
      if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
      if (data.length === 0) { message.info('未找到有效数据'); return; }

      // 建立 姓名+发薪公司 -> unique_hash 映射
      const empList = Object.values(employees);
      let success = 0;
      const failures: string[] = [];

      for (const row of data) {
        try {
          const emp = empList.find((e: any) => e.name === row.name && e.pay_company === row.pay_company);
          if (!emp) {
            failures.push(`${row.name}（${row.pay_company}）无法匹配花名册`);
            continue;
          }
          if (!row.adjust_type) { failures.push(`${row.name}：缺调整类型`); continue; }
          if (!row.reason) { failures.push(`${row.name}：缺调整原因`); continue; }
          await api.post('/attendance_adjustments', {
            ...row,
            unique_hash: emp.unique_hash,
            period,
            currency: '人民币',
          });
          success++;
        } catch {
          failures.push(`${row.name}：导入失败`);
        }
      }
      if (failures.length > 0) {
        message.warning(`导入完成：成功 ${success} 条，失败 ${failures.length} 条。${failures.slice(0, 8).join('；')}`);
      } else {
        message.success(`导入完成：${success} / ${data.length} 条`);
      }
      loadData();
    } catch (e: any) {
      message.error(e.message || '导入失败');
    }
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
      // 有 id 说明是编辑已有记录
      if (addForm.id) {
        await api.patch(`/attendance_records?id=eq.${addForm.id}`, {
          ...addForm,
          period,
        });
        message.success('更新成功');
      } else {
        await api.post('/attendance_records', {
          ...addForm,
          period,
          data_status: '草稿',
        });
        message.success('添加成功');
      }
      setAddOpen(false);
      setAddForm({});
      loadData();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  // 考勤详情导出表头（含系统计算字段）
  const ATT_DETAIL_EXPORT_DEF: ExportDef = {
    module: '考勤详情',
    columns: [
      { key: 'unique_hash', label: '唯一值', hidden: false },
      { key: 'employee_name', label: '姓名' },
      { key: 'pay_company', label: '发薪公司' },
      { key: 'cost_center', label: '成本中心' },
      { key: 'department', label: '部门' },
      { key: 'report_to', label: '汇报人' },
      { key: 'position', label: '职位' },
      { key: 'attendance_type', label: '考勤制' },
      { key: 'entry_date', label: '入职日期' },
      { key: 'basic_salary', label: '基本工资' },
      { key: 'attendance_wage', label: '考勤工资' },
      { key: 'pay_days', label: '计薪天数' },
      { key: 'seniority', label: '本企业连续工龄(年)' },
      { key: 'daily_wage', label: '日薪' },
      { key: 'sick_pay_rate', label: '病假支付系数' },
      { key: 'sick_days', label: '病假(天)' },
      { key: 'sick_amount', label: '病假金额' },
      { key: 'personal_days', label: '事假(天)' },
      { key: 'personal_amount', label: '事假金额' },
      { key: 'absenteeism_days', label: '旷工(天)' },
      { key: 'absenteeism_amount', label: '旷工金额' },
      { key: 'regular_overtime_days', label: '平时加班(天)' },
      { key: 'weekend_overtime_days', label: '周末加班(天)' },
      { key: 'holiday_overtime_days', label: '节假日加班(天)' },
      { key: 'overtime_hours', label: '延时加班(小时)' },
      { key: 'hourly_rate', label: '时薪' },
      { key: 'overtime_amount', label: '加班金额' },
      { key: 'actual_attendance_days', label: '实际出勤天数' },
      { key: 'on_off_adjust', label: '入离职调整' },
      { key: 'special_adjust_amount', label: '特殊调整金额' },
      { key: 'attendance_adjust_total', label: '考勤调整合计' },
      { key: 'data_source', label: '数据来源' },
      { key: 'data_status', label: '数据状态' },
    ],
  };

  // 导出（报表）
  const handleExport = () => exportXlsx(EXPORT_DEF, records, period);

  // 导出（详情）
  const handleExportDetail = () => exportXlsx(ATT_DETAIL_EXPORT_DEF, records, period);

  // 导入
  const handleImport = async (file: File) => {
    try {
      const { data, import_errors } = await importXlsx(EXPORT_DEF, file);
      if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
      if (data.length === 0) { message.info('未找到有效数据'); return; }

      const validPayDays = attRules.pay_days_options.length ? attRules.pay_days_options : [21.75, 26, 30];
      let success = 0;
      const failures: string[] = [];

      for (const row of data) {
        try {
          // ===== 校验 =====
          if (!row.unique_hash) {
            failures.push('缺唯一值（姓名/发薪公司/入职日期未匹配花名册）');
            continue;
          }
          // 计薪天数
          const pd = Number(row.pay_days);
          if (!pd) { failures.push(`${row.unique_hash}：计薪天数为空`); continue; }
          if (!validPayDays.includes(pd)) { failures.push(`${row.unique_hash}：计薪天数 ${pd} 不在规则选项内（${validPayDays.join('/')}）`); continue; }
          // 病假连续信息
          if ((Number(row.sick_days) || 0) > 0) {
            const isCont = String(row.is_continuous_sick).toLowerCase();
            if (isCont !== 'true' && isCont !== '是' && isCont !== 'false' && isCont !== '否' && isCont !== '') {
              failures.push(`${row.unique_hash}：是否连续病假填写错误`);
              continue;
            }
            if ((isCont === 'true' || isCont === '是') && (!row.continuous_sick_start || !row.continuous_sick_end)) {
              failures.push(`${row.unique_hash}：连续病假缺少起止日期`);
              continue;
            }
            if (row.continuous_sick_start && row.continuous_sick_end && row.continuous_sick_end < row.continuous_sick_start) {
              failures.push(`${row.unique_hash}：连续病假结束日期早于开始日期`);
              continue;
            }
          }
          // 加班：延时加班(小时) 必须配时薪
          if ((Number(row.overtime_hours) || 0) > 0 && !row.hourly_rate) {
            failures.push(`${row.unique_hash}：有延时加班小时数但缺时薪`);
            continue;
          }
          // 天数不能为负
          const dayFields = ['sick_days', 'personal_days', 'annual_leave', 'compensatory_leave', 'absenteeism_days', 'funeral_leave', 'parental_leave', 'marriage_leave', 'maternity_leave', 'regular_overtime_days', 'weekend_overtime_days', 'holiday_overtime_days', 'overtime_hours'];
          for (const f of dayFields) {
            if (Number(row[f]) < 0) {
              failures.push(`${row.unique_hash}：${f} 不能为负数`);
              continue;
            }
          }

          const existing = await api.get(`/attendance_records?unique_hash=eq.${row.unique_hash}&period=eq.${period}`);
          // 剔除花名册同步字段（不属于考勤表，仅供导出展示）
          const {
            employee_name, pay_company, cost_center, department, report_to, position, attendance_type, entry_date,
            ...dbRow
          } = row;
          const payload = { ...dbRow, period };
          if (existing.data.length > 0) {
            await api.patch(`/attendance_records?id=eq.${existing.data[0].id}`, payload);
          } else {
            await api.post('/attendance_records', payload);
          }
          success++;
        } catch {
          failures.push('导入失败');
        }
      }
      if (failures.length > 0) {
        message.warning(`导入完成：成功 ${success} 条，失败 ${failures.length} 条。${failures.slice(0, 8).join('；')}`);
      } else {
        message.success(`导入完成：${success} / ${data.length} 条`);
      }
      loadData();
    } catch (e: any) {
      message.error(e.message || '导入失败');
    }
  };

  // 是否锁定（已锁定或已提交老板查看，均不可编辑）
  const isLocked = (r: any) => r.data_status === '已锁定' || r.data_status === '已提交老板查看';

  // 可选展示列（默认隐藏）
  const optionalColumns: { key: string; title: string; source: any; dataIndex: string; render?: (v: any, r: any) => any }[] = [
    { key: 'seniority', title: '本企业连续工龄', source: '系统计算', dataIndex: 'seniority', render: (v: any) => v !== undefined ? `${v} 年` : '—' },
    { key: 'daily_wage', title: '日薪', source: '系统计算', dataIndex: 'daily_wage', render: (v: any) => fmtMoney(v) },
    { key: 'sick_pay_rate', title: '病假支付系数', source: '系统计算', dataIndex: 'sick_pay_rate', render: (v: any) => v !== undefined ? `${(v * 100).toFixed(0)}%` : '—' },
    { key: 'is_continuous_sick', title: '是否连续病假', source: '导入', dataIndex: 'is_continuous_sick', render: (v: any) => v === true ? '是' : v === false ? '否' : '—' },
    { key: 'continuous_sick_start', title: '连续病假开始', source: '导入', dataIndex: 'continuous_sick_start', render: (v: any) => v || '—' },
    { key: 'continuous_sick_end', title: '连续病假结束', source: '导入', dataIndex: 'continuous_sick_end', render: (v: any) => v || '—' },
    { key: 'special_adjust_amount', title: '特殊调整金额', source: '导入', dataIndex: 'special_adjust_amount', render: (v: any) => fmtMoney(v) },
    { key: 'data_source', title: '数据来源', source: '系统计算', dataIndex: 'data_source', render: (v: any) => v || '—' },
    { key: 'abnormal', title: '异常状态', source: '系统计算', dataIndex: 'abnormal', render: (v: any) => v === '异常' ? <Tag color="orange">异常</Tag> : <Tag color="green">正常</Tag> },
  ];

  // 汇总卡片
  const summary = {
    count: records.length,
    sickDays: records.reduce((s, r) => s + (r.sick_days || 0), 0),
    personalDays: records.reduce((s, r) => s + (r.personal_days || 0), 0),
    annualLeave: records.reduce((s, r) => s + (r.annual_leave || 0), 0),
    compensatory: records.reduce((s, r) => s + (r.compensatory_leave || 0), 0),
    absenteeism: records.reduce((s, r) => s + (r.absenteeism_days || 0), 0),
    overtime: records.reduce((s, r) => s + (r.regular_overtime_days || 0) + (r.weekend_overtime_days || 0) + (r.holiday_overtime_days || 0), 0),
    overtimeHours: records.reduce((s, r) => s + (r.overtime_hours || 0), 0),
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
      render: (v: number) => fmtMoney(v) },
    { title: withSource('考勤工资', '导入'), dataIndex: 'attendance_wage', key: 'aw', width: 110, render: (v: any) => fmtMoney(v) },
    { title: withSource('计薪天数', '导入'), dataIndex: 'pay_days', key: 'pd', width: 90, render: (v: any) => v || '—' },
    { title: withSource('病假(天)', '导入'), dataIndex: 'sick_days', key: 'sd', width: 80, render: (v: any) => v ?? '—' },
    { title: withSource('病假金额', '系统计算'), dataIndex: 'sick_amount', key: 'sa', width: 90, render: (v: number) => <span style={{ color: v < 0 ? '#e74c3c' : undefined }}>{fmtMoney(v)}</span> },
    { title: withSource('事假(天)', '导入'), dataIndex: 'personal_days', key: 'pd2', width: 80, render: (v: any) => v ?? '—' },
    { title: withSource('事假金额', '系统计算'), dataIndex: 'personal_amount', key: 'pa', width: 90, render: (v: number) => <span style={{ color: v < 0 ? '#e74c3c' : undefined }}>{fmtMoney(v)}</span> },
    { title: withSource('旷工(天)', '导入'), dataIndex: 'absenteeism_days', key: 'ad', width: 80, render: (v: any) => v ?? '—' },
    { title: withSource('平时加班(天)', '导入'), dataIndex: 'regular_overtime_days', key: 'rod', width: 110, render: (v: any) => v ?? '—' },
    { title: withSource('周末加班(天)', '导入'), dataIndex: 'weekend_overtime_days', key: 'wod', width: 110, render: (v: any) => v ?? '—' },
    { title: withSource('节假日加班(天)', '导入'), dataIndex: 'holiday_overtime_days', key: 'hod', width: 110, render: (v: any) => v ?? '—' },
    { title: withSource('延时加班(小时)', '导入'), dataIndex: 'overtime_hours', key: 'oh', width: 110, render: (v: any) => v ?? '—' },
    { title: withSource('时薪', '导入'), dataIndex: 'hourly_rate', key: 'hr', width: 90, render: (v: any) => fmtMoney(v) },
    { title: withSource('加班金额', '系统计算'), dataIndex: 'overtime_amount', key: 'oa', width: 90, render: (v: number) => fmtMoney(v) },
    { title: withSource('入离职调整', '系统计算'), dataIndex: 'on_off_adjust', key: 'oof', width: 100, render: (v: number) => fmtMoney(v) },
    { title: withSource('考勤调整合计', '系统计算'), dataIndex: 'attendance_adjust_total', key: 'aat', width: 110, fixed: 'right',
      render: (v: number) => <strong style={{ color: v < 0 ? '#e74c3c' : '#27ae60' }}>{fmtMoney(v)}</strong> },
    { title: withSource('数据状态', '系统计算'), dataIndex: 'data_status', key: 'ds', width: 100,
      render: (v: string) => <Tag color={v === '已锁定' ? 'red' : v === '草稿' ? 'default' : 'blue'}>{v}</Tag> },
    { title: withSource('异常状态', '系统计算'), dataIndex: 'abnormal', key: 'abn', width: 90,
      render: (v: string) => v === '异常' ? <Tag color="orange">异常</Tag> : <Tag color="green">正常</Tag> },
    // 可选列（按列设置动态显示）
    ...optionalColumns
      .filter(col => visibleOptionalCols.includes(col.key))
      .map(col => ({
        title: withSource(col.title, col.source),
        dataIndex: col.dataIndex,
        key: col.key,
        width: 110,
        render: col.render,
      })),
    {
      title: '操作', key: 'act', width: 120, fixed: 'right',
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" onClick={() => openDetail(r)}>查看</Button>
          <Button size="small" type="primary" disabled={isLocked(r)} onClick={() => openEdit(r)}>编辑</Button>
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
          <Dropdown menu={{
            items: [
              { key: 'import', label: '导入' },
              { key: 'export', label: '导出' },
            ],
            onClick: ({ key }) => {
              if (key === 'import') {
                // 触发导入
                document.getElementById('adj-import-upload')?.click();
              } else {
                handleAdjExport();
              }
            },
          }}>
            <Button icon={<PlusOutlined />}>特殊调整</Button>
          </Dropdown>
          <Dropdown menu={{
            items: [
              { key: 'full', label: '导出报表' },
              { key: 'detail', label: '导出详情' },
            ],
            onClick: ({ key }) => {
              if (key === 'detail') handleExportDetail();
              else handleExport();
            },
          }}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
          <Button icon={<SettingOutlined />} onClick={() => setColSettingOpen(true)}>列设置</Button>
          <Button icon={<SettingOutlined />} onClick={() => navigate('/attendance/rules')}>规则配置</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { handleImport(file); return false; }}>
            <Button icon={<UploadOutlined />}>导入考勤</Button>
          </Upload>
          <Upload
            id="adj-import-upload"
            accept=".xlsx,.xls"
            showUploadList={false}
            style={{ display: 'none' }}
            beforeUpload={(file) => { handleAdjImport(file); return false; }}
          >
            <Button icon={<UploadOutlined />}>导入特殊调整</Button>
          </Upload>
        </Space>
      </Card>

      {/* 筛选区 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 150 }}
            options={Object.values(employees).map((e: any) => ({ value: e.pay_company, label: e.pay_company })).filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)} />
          <Input placeholder="成本中心" value={fCostCenter} onChange={e => setFCostCenter(e.target.value)} style={{ width: 120 }} allowClear />
          <Input placeholder="部门" value={fDepartment} onChange={e => setFDepartment(e.target.value)} style={{ width: 120 }} allowClear />
          <Input placeholder="汇报人" value={fReportTo} onChange={e => setFReportTo(e.target.value)} style={{ width: 100 }} allowClear />
          <Select placeholder="考勤制" allowClear value={fAttType} onChange={setFAttType} style={{ width: 140 }}
            options={['全日制', '非全日制', '代收代付残疾人', '不定时工作制'].map(s => ({ value: s, label: s }))} />
          <Select placeholder="计薪天数" allowClear value={fPayDays} onChange={setFPayDays} style={{ width: 110 }}
            options={(attRules.pay_days_options.length ? attRules.pay_days_options : [21.75, 26, 30]).map((d: number) => ({ value: String(d), label: `${d}天` }))} />
          <Select placeholder="数据状态" allowClear value={fStatus} onChange={setFStatus} style={{ width: 140 }}
            options={['草稿', '已计算', '已提交老板查看', '退回修改', '已导出', '已锁定', '未录入'].map(s => ({ value: s, label: s }))} />
          <Select placeholder="异常状态" allowClear value={fAbnormal} onChange={setFAbnormal} style={{ width: 110 }}
            options={[{ value: '仅异常', label: '仅异常' }, { value: '仅正常', label: '仅正常' }]} />
          <Input placeholder="搜索姓名" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ width: 120 }} allowClear />
        </Space>
      </Card>

      {/* 汇总卡片 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size="large" wrap>
          <span>员工人数：<strong>{summary.count}</strong></span>
          <span>病假天数：<strong>{summary.sickDays}</strong></span>
          <span>事假天数：<strong>{summary.personalDays}</strong></span>
          <span>旷工天数：<strong>{summary.absenteeism}</strong></span>
          <span>加班(天)：<strong>{summary.overtime}</strong></span>
          <span>延时加班(小时)：<strong>{summary.overtimeHours}</strong></span>
          <span>扣款合计：<strong style={{ color: '#e74c3c' }}>{fmtMoney(summary.deductAmount)}</strong></span>
          <span>增发合计：<strong style={{ color: '#27ae60' }}>{fmtMoney(summary.addAmount)}</strong></span>
          <span>考勤调整净额：<strong style={{ color: summary.netTotal < 0 ? '#e74c3c' : '#27ae60' }}>{fmtMoney(summary.netTotal)}</strong></span>
        </Space>
      </Card>

      <div ref={scrollRef} onWheel={onWheel}>
        <Table columns={columns} dataSource={records} loading={loading} scroll={{ x: 2400 }} size="small" pagination={{ pageSize: 50 }} />
      </div>

      {/* 详情抽屉 */}
      <Drawer title="考勤详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={680}>
        {detailRecord && (() => {
          const calcResult = calcRecord(detailRecord);
          return (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="姓名">{detailRecord.employee_name}</Descriptions.Item>
            <Descriptions.Item label="发薪公司">{detailRecord.pay_company}</Descriptions.Item>
            <Descriptions.Item label="职位">{detailRecord.position}</Descriptions.Item>
            <Descriptions.Item label="入职日期">{detailRecord.entry_date}</Descriptions.Item>
            <Descriptions.Item label="基本工资">{fmtMoney(detailRecord.basic_salary)}</Descriptions.Item>
            <Descriptions.Item label="考勤工资">{fmtMoney(detailRecord.attendance_wage)}</Descriptions.Item>
            <Descriptions.Item label="计薪天数">{detailRecord.pay_days}</Descriptions.Item>

            {/* 计算依据 */}
            <Descriptions.Item label="本企业连续工龄">{calcResult.seniority_years} 年</Descriptions.Item>
            <Descriptions.Item label="日薪">{fmtMoney(calcResult.daily_wage)}</Descriptions.Item>
            <Descriptions.Item label="病假支付系数">{(calcResult.sick_pay_rate * 100).toFixed(0)}%</Descriptions.Item>
            <Descriptions.Item label="病假扣款系数">{(calcResult.sick_deduct_rate * 100).toFixed(0)}%</Descriptions.Item>

            {/* 考勤数据 */}
            <Descriptions.Item label="病假天数">{detailRecord.sick_days}</Descriptions.Item>
            <Descriptions.Item label="病假金额">{fmtMoney(detailRecord.sick_amount)}</Descriptions.Item>
            <Descriptions.Item label="事假天数">{detailRecord.personal_days}</Descriptions.Item>
            <Descriptions.Item label="事假金额">{fmtMoney(detailRecord.personal_amount)}</Descriptions.Item>
            <Descriptions.Item label="旷工天数">{detailRecord.absenteeism_days}</Descriptions.Item>
            <Descriptions.Item label="旷工金额">{fmtMoney(detailRecord.absenteeism_amount)}</Descriptions.Item>
            <Descriptions.Item label="平时加班(天)">{detailRecord.regular_overtime_days ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="周末加班(天)">{detailRecord.weekend_overtime_days ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="节假日加班(天)">{detailRecord.holiday_overtime_days ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="延时加班(小时)">{detailRecord.overtime_hours ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="时薪">{fmtMoney(detailRecord.hourly_rate)}</Descriptions.Item>
            <Descriptions.Item label="加班金额">{fmtMoney(detailRecord.overtime_amount)}</Descriptions.Item>
            <Descriptions.Item label="实际出勤天数">{detailRecord.actual_attendance_days || '—'}</Descriptions.Item>
            <Descriptions.Item label="入离职调整">{fmtMoney(detailRecord.on_off_adjust)}</Descriptions.Item>
            <Descriptions.Item label="考勤调整合计" span={2}>
              <strong>{fmtMoney(detailRecord.attendance_adjust_total)}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="数据来源">{detailRecord.data_source || '导入'}</Descriptions.Item>
            <Descriptions.Item label="最近计算时间">{detailRecord.updated_at ? new Date(detailRecord.updated_at).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="数据状态" span={2}>{detailRecord.data_status}</Descriptions.Item>
          </Descriptions>
          );
        })()}
      </Drawer>

      {/* 列设置抽屉 */}
      <Drawer title="列设置" open={colSettingOpen} onClose={() => setColSettingOpen(false)} width={360}>
        <div style={{ marginBottom: 12, color: '#666' }}>勾选需要额外显示的列（默认隐藏）</div>
        {optionalColumns.map(col => (
          <div key={col.key} style={{ marginBottom: 8 }}>
            <Space>
              <input
                type="checkbox"
                checked={visibleOptionalCols.includes(col.key)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setVisibleOptionalCols([...visibleOptionalCols, col.key]);
                  } else {
                    setVisibleOptionalCols(visibleOptionalCols.filter(k => k !== col.key));
                  }
                }}
              />
              <span>{col.title}</span>
              <Tag color="purple" style={{ fontSize: 10 }}>{col.source}</Tag>
            </Space>
          </div>
        ))}
      </Drawer>

      {/* 特殊调整抽屉 */}
      <Drawer
        title="特殊考勤调整"
        open={adjOpen}
        onClose={() => setAdjOpen(false)}
        width={560}
        extra={
          <Space>
            <Button onClick={() => setAdjOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleAdjSave}>保存</Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Form.Item label="员工" required>
            <Select showSearch optionFilterProp="label" placeholder="从花名册选择员工"
              value={adjForm.unique_hash}
              onChange={(v) => setAdjForm({ ...adjForm, unique_hash: v })}
              options={Object.values(employees).map((e: any) => ({ value: e.unique_hash, label: `${e.name} — ${e.pay_company}` }))} />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="调整类型" required>
              <Select style={{ width: 160 }} value={adjForm.adjust_type} onChange={(v) => setAdjForm({ ...adjForm, adjust_type: v })}
                options={['考勤调整', '津贴', '补贴', '实习津贴', '其他'].map(t => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item label="调整方向" required>
              <Select style={{ width: 120 }} value={adjForm.direction} onChange={(v) => setAdjForm({ ...adjForm, direction: v })}
                options={[{ value: '增发', label: '增发' }, { value: '扣减', label: '扣减' }]} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="调整基数">
              <InputNumber style={{ width: 140 }} min={0} value={adjForm.adjust_base} onChange={(v) => setAdjForm({ ...adjForm, adjust_base: v })} />
            </Form.Item>
            <Form.Item label="调整数量">
              <InputNumber style={{ width: 120 }} min={0} value={adjForm.adjust_qty} onChange={(v) => setAdjForm({ ...adjForm, adjust_qty: v })} />
            </Form.Item>
            <Form.Item label="计发比例">
              <InputNumber style={{ width: 120 }} min={0} max={10} step={0.1} value={adjForm.adjust_ratio} onChange={(v) => setAdjForm({ ...adjForm, adjust_ratio: v })} placeholder="如1=100%" />
            </Form.Item>
          </Space>
          <Form.Item label="固定调整金额（填此项则按固定金额计算）">
            <InputNumber style={{ width: 180 }} value={adjForm.fixed_amount} onChange={(v) => setAdjForm({ ...adjForm, fixed_amount: v })} />
          </Form.Item>
          <Form.Item label="调整原因" required>
            <Input value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} />
          </Form.Item>
          <Form.Item label="备注">
            <Input.TextArea rows={2} value={adjForm.attachment_note} onChange={(e) => setAdjForm({ ...adjForm, attachment_note: e.target.value })} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* 添加/编辑记录抽屉 */}
      <Drawer
        title={addForm.id ? '编辑考勤记录' : '添加考勤记录'}
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
              disabled={!!addForm.id}
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
            <Form.Item label="考勤工资">
              <InputNumber style={{ width: 160 }} value={addForm.attendance_wage} onChange={(v) => setAddForm({ ...addForm, attendance_wage: v })} />
            </Form.Item>
            <Form.Item label="计薪天数" required>
              <Select style={{ width: 160 }} value={addForm.pay_days} onChange={(v) => setAddForm({ ...addForm, pay_days: v })}
                options={(attRules.pay_days_options.length ? attRules.pay_days_options : [21.75, 26, 30]).map((d: number) => ({ value: d, label: String(d) }))} />
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
            <Form.Item label="平时加班(天)">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.regular_overtime_days} onChange={(v) => setAddForm({ ...addForm, regular_overtime_days: v })} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="周末加班(天)">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.weekend_overtime_days} onChange={(v) => setAddForm({ ...addForm, weekend_overtime_days: v })} />
            </Form.Item>
            <Form.Item label="节假日加班(天)">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.holiday_overtime_days} onChange={(v) => setAddForm({ ...addForm, holiday_overtime_days: v })} />
            </Form.Item>
            <Form.Item label="延时加班(小时)">
              <InputNumber style={{ width: 120 }} min={0} value={addForm.overtime_hours} onChange={(v) => setAddForm({ ...addForm, overtime_hours: v })} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="时薪（延时加班用）">
              <InputNumber style={{ width: 160 }} min={0} value={addForm.hourly_rate} onChange={(v) => setAddForm({ ...addForm, hourly_rate: v })} />
            </Form.Item>
            <Form.Item label="法定节假日固定金额（保洁）">
              <InputNumber style={{ width: 180 }} min={0} value={addForm.holiday_fixed_amount} onChange={(v) => setAddForm({ ...addForm, holiday_fixed_amount: v })} />
            </Form.Item>
          </Space>

          {/* 连续病假 */}
          <Card size="small" title="连续病假（病假天数>0 时建议填写）" style={{ marginBottom: 12 }}>
            <Space style={{ width: '100%' }} size="large">
              <Form.Item label="是否连续病假">
                <Select style={{ width: 120 }} allowClear value={addForm.is_continuous_sick} onChange={(v) => setAddForm({ ...addForm, is_continuous_sick: v })}
                  options={[{ value: true, label: '是' }, { value: false, label: '否' }]} />
              </Form.Item>
              <Form.Item label="连续病假开始日期">
                <DatePicker style={{ width: 150 }} value={addForm.continuous_sick_start ? dayjs(addForm.continuous_sick_start) : undefined}
                  onChange={(_, dateStr) => setAddForm({ ...addForm, continuous_sick_start: dateStr })} />
              </Form.Item>
              <Form.Item label="连续病假结束日期">
                <DatePicker style={{ width: 150 }} value={addForm.continuous_sick_end ? dayjs(addForm.continuous_sick_end) : undefined}
                  onChange={(_, dateStr) => setAddForm({ ...addForm, continuous_sick_end: dateStr })} />
              </Form.Item>
            </Space>
          </Card>

          {/* 其他假期 */}
          <Space style={{ width: '100%' }} size="large" wrap>
            <Form.Item label="丧假">
              <InputNumber style={{ width: 100 }} min={0} value={addForm.funeral_leave} onChange={(v) => setAddForm({ ...addForm, funeral_leave: v })} />
            </Form.Item>
            <Form.Item label="育儿假">
              <InputNumber style={{ width: 100 }} min={0} value={addForm.parental_leave} onChange={(v) => setAddForm({ ...addForm, parental_leave: v })} />
            </Form.Item>
            <Form.Item label="婚假">
              <InputNumber style={{ width: 100 }} min={0} value={addForm.marriage_leave} onChange={(v) => setAddForm({ ...addForm, marriage_leave: v })} />
            </Form.Item>
            <Form.Item label="产假">
              <InputNumber style={{ width: 100 }} min={0} value={addForm.maternity_leave} onChange={(v) => setAddForm({ ...addForm, maternity_leave: v })} />
            </Form.Item>
          </Space>

          {/* 入离职 */}
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="实际出勤天数">
              <InputNumber style={{ width: 140 }} min={0} value={addForm.actual_attendance_days} onChange={(v) => setAddForm({ ...addForm, actual_attendance_days: v })} />
            </Form.Item>
            <Form.Item label="发薪公司转移日期">
              <DatePicker style={{ width: 150 }} value={addForm.transfer_date ? dayjs(addForm.transfer_date) : undefined}
                onChange={(_, dateStr) => setAddForm({ ...addForm, transfer_date: dateStr })} />
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
