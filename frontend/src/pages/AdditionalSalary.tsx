import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Space, Input, Select, message, Upload } from 'antd';
import { DownloadOutlined, UploadOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../api/client';
import { exportXlsx, importXlsx, type ExportDef } from '../utils/importExport';
import { withSource } from '../components/SourceTag';
import { useHorizontalScroll } from '../utils/useHorizontalScroll';
import { isActiveInPeriod } from '../utils/employee';

/**
 * 附加薪酬板块
 * 12项收入（不含基本工资），导入导出，附加薪酬合计 = 12项之和
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头（全字段）
const EXPORT_DEF: ExportDef = {
  module: '附加薪酬',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名', required: true },
    { key: 'pay_company', label: '发薪公司', required: true },
    { key: 'cost_center', label: '成本中心' },
    { key: 'department', label: '部门' },
    { key: 'report_to', label: '汇报人' },
    { key: 'position', label: '职位' },
    { key: 'entry_date', label: '入职日期' },
    { key: 'attendance_type', label: '考勤制' },
    { key: 'allowance_supp', label: '补贴/补公积金' },
    { key: 'other_adjust', label: '其他补贴/调整' },
    { key: 'insurance_amount', label: '商保金额' },
    { key: 'kpi_provision', label: 'KPI预提' },
    { key: 'office_comm', label: '商办佣金' },
    { key: 'performance_pay', label: '绩效' },
    { key: 'apartment_comm', label: '公寓佣金' },
    { key: 'talent_kpi', label: '人才系KPI' },
    { key: 'heat_allowance', label: '防暑降温费' },
    { key: 'other_allowance', label: '津贴' },
    { key: 'security_bonus', label: '保安奖金' },
    { key: 'cleaning_bonus', label: '保洁奖金' },
  ],
};

const AdditionalSalaryPage: React.FC = () => {
  const { ref: scrollRef, onWheel } = useHorizontalScroll<HTMLDivElement>();
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, any>>({});
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);

  // 筛选
  const [fPayCompany, setFPayCompany] = useState<string>();
  const [fCostCenter, setFCostCenter] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();
  const [keyword, setKeyword] = useState('');

  useEffect(() => { loadData(); }, [period, fPayCompany, fCostCenter, fDepartment, keyword]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, recRes] = await Promise.all([
        api.get('/employees?select=unique_hash,name,status,pay_company,cost_center,department,report_to,position,entry_date,leave_date,attendance_type'),
        api.get(`/additional_salary_records?select=*&period=eq.${period}`),
      ]);
      const empList: any[] = empRes.data;
      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });
      setEmployees(empMap);

      const recMap: Record<string, any> = {};
      recRes.data.forEach((r: any) => { recMap[r.unique_hash] = r; });

      let merged = empList
        .filter((e: any) => isActiveInPeriod(e, period) || recMap[e.unique_hash])
        .map((e: any) => {
          const r = recMap[e.unique_hash];
          const additionalTotal = Number((
            (r?.allowance_supp || 0) + (r?.other_adjust || 0) + (r?.insurance_amount || 0) +
            (r?.kpi_provision || 0) + (r?.office_comm || 0) + (r?.performance_pay || 0) +
            (r?.apartment_comm || 0) + (r?.talent_kpi || 0) + (r?.heat_allowance || 0) +
            (r?.other_allowance || 0) + (r?.security_bonus || 0) + (r?.cleaning_bonus || 0)
          ).toFixed(2));
          // 绩效&佣金合计 = 商办佣金 + 绩效 + 公寓佣金 + 人才系KPI + 防暑降温费 + 津贴 + 保安奖金 + 保洁奖金
          const perfCommTotal = Number((
            (r?.office_comm || 0) + (r?.performance_pay || 0) + (r?.apartment_comm || 0) +
            (r?.talent_kpi || 0) + (r?.heat_allowance || 0) + (r?.other_allowance || 0) +
            (r?.security_bonus || 0) + (r?.cleaning_bonus || 0)
          ).toFixed(2));
          return {
            ...(r || {}),
            key: r?.id ?? `emp-${e.unique_hash}`,
            unique_hash: e.unique_hash,
            employee_name: e.name,
            pay_company: e.pay_company || '',
            cost_center: e.cost_center || '',
            department: e.department || '',
            report_to: e.report_to || '',
            position: e.position || '',
            entry_date: e.entry_date || '',
            attendance_type: e.attendance_type || '',
            additional_total: additionalTotal,
            perf_comm_total: perfCommTotal,
          };
        });

      // 前端筛选
      if (fPayCompany) merged = merged.filter((r: any) => r.pay_company === fPayCompany);
      if (fCostCenter) merged = merged.filter((r: any) => (r.cost_center || '').includes(fCostCenter));
      if (fDepartment) merged = merged.filter((r: any) => (r.department || '').includes(fDepartment));
      if (keyword) merged = merged.filter((r: any) => (r.employee_name || '').includes(keyword));

      setRecords(merged);
    } catch { message.error('加载附加薪酬数据失败'); }
    finally { setLoading(false); }
  };

  const handleExport = () => exportXlsx(EXPORT_DEF, records, period);

  const handleImport = async (file: File) => {
    try {
      const { data, import_errors } = await importXlsx(EXPORT_DEF, file);
      if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
      if (data.length === 0) { message.info('未找到有效数据'); return; }

      let success = 0;
      const failures: string[] = [];
      for (const row of data) {
        try {
          if (!row.unique_hash) {
            failures.push(`${row.employee_name || '?'}：缺唯一值`);
            continue;
          }
          const { employee_name, pay_company, cost_center, department, report_to, position, entry_date, attendance_type, ...dbRow } = row;
          const existing = await api.get(`/additional_salary_records?unique_hash=eq.${row.unique_hash}&period=eq.${period}`);
          if (existing.data.length > 0) {
            await api.patch(`/additional_salary_records?id=eq.${existing.data[0].id}`, { ...dbRow, period });
          } else {
            await api.post('/additional_salary_records', { ...dbRow, period });
          }
          success++;
        } catch {
          failures.push(`${row.employee_name || '?'}：导入失败`);
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

  const columns: any[] = [
    { title: withSource('姓名', '花名册同步'), dataIndex: 'employee_name', key: 'name', width: 90, fixed: 'left' },
    { title: withSource('发薪公司', '花名册同步'), dataIndex: 'pay_company', key: 'co', width: 130, ellipsis: true, fixed: 'left' },
    { title: withSource('成本中心', '花名册同步'), dataIndex: 'cost_center', key: 'cc', width: 90 },
    { title: withSource('部门', '花名册同步'), dataIndex: 'department', key: 'dept', width: 90 },
    { title: withSource('汇报人', '花名册同步'), dataIndex: 'report_to', key: 'rpt', width: 80 },
    { title: withSource('职位', '花名册同步'), dataIndex: 'position', key: 'pos', width: 90 },
    { title: withSource('入职日期', '花名册同步'), dataIndex: 'entry_date', key: 'jd', width: 100 },
    { title: withSource('考勤制', '花名册同步'), dataIndex: 'attendance_type', key: 'ws', width: 100 },
    { title: withSource('补贴/补公积金', '导入'), dataIndex: 'allowance_supp', key: 'as', width: 110, render: fmtMoney },
    { title: withSource('其他补贴/调整', '导入'), dataIndex: 'other_adjust', key: 'oa', width: 110, render: fmtMoney },
    { title: withSource('商保金额', '导入'), dataIndex: 'insurance_amount', key: 'ia', width: 90, render: fmtMoney },
    { title: withSource('KPI预提', '导入'), dataIndex: 'kpi_provision', key: 'kp', width: 90, render: fmtMoney },
    { title: withSource('商办佣金', '导入'), dataIndex: 'office_comm', key: 'oc', width: 90, render: fmtMoney },
    { title: withSource('绩效', '导入'), dataIndex: 'performance_pay', key: 'pp', width: 90, render: fmtMoney },
    { title: withSource('公寓佣金', '导入'), dataIndex: 'apartment_comm', key: 'ac', width: 90, render: fmtMoney },
    { title: withSource('人才系KPI', '导入'), dataIndex: 'talent_kpi', key: 'tk', width: 90, render: fmtMoney },
    { title: withSource('防暑降温费', '导入'), dataIndex: 'heat_allowance', key: 'ha', width: 100, render: fmtMoney },
    { title: withSource('津贴', '导入'), dataIndex: 'other_allowance', key: 'oal', width: 80, render: fmtMoney },
    { title: withSource('保安奖金', '导入'), dataIndex: 'security_bonus', key: 'sb', width: 90, render: fmtMoney },
    { title: withSource('保洁奖金', '导入'), dataIndex: 'cleaning_bonus', key: 'cb', width: 90, render: fmtMoney },
    { title: withSource('绩效&佣金合计', '系统计算'), dataIndex: 'perf_comm_total', key: 'pct', width: 120, fixed: 'right', render: fmtMoney },
    { title: withSource('附加薪酬合计', '系统计算'), dataIndex: 'additional_total', key: 'at', width: 120, fixed: 'right',
      render: (v: any) => <strong>{fmtMoney(v)}</strong> },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <span>月份：</span>
          <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 180 }} />
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { handleImport(file); return false; }}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
        </Space>
      </Card>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select placeholder="发薪公司" allowClear showSearch optionFilterProp="label" value={fPayCompany} onChange={setFPayCompany} style={{ width: 150 }}
            options={Object.values(employees).map((e: any) => ({ value: e.pay_company, label: e.pay_company })).filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)} />
          <Input placeholder="成本中心" value={fCostCenter} onChange={e => setFCostCenter(e.target.value)} style={{ width: 120 }} allowClear />
          <Input placeholder="部门" value={fDepartment} onChange={e => setFDepartment(e.target.value)} style={{ width: 120 }} allowClear />
          <Input prefix={<SearchOutlined />} placeholder="搜索姓名" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ width: 140 }} allowClear />
        </Space>
      </Card>

      <div ref={scrollRef} onWheel={onWheel}>
        <Table columns={columns} dataSource={records} loading={loading} scroll={{ x: 2200 }} size="small" pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 条` }} />
      </div>
    </div>
  );
};

export default AdditionalSalaryPage;
