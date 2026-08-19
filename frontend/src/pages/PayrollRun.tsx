import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, message, Input, Tag, Select, Modal, Input as AntInput } from 'antd';
import { DownloadOutlined, CheckCircleOutlined, RollbackOutlined, SendOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../api/client';
import { exportXlsx, type ExportDef } from '../utils/importExport';
import { withSource } from '../components/SourceTag';
import { useHorizontalScroll } from '../utils/useHorizontalScroll';

/**
 * 薪资计算板块（改造版）
 * 从各模块取数计算，仅导出不支持导入，审批流带弹窗
 */

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '') return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头（全字段）
const EXPORT_DEF: ExportDef = {
  module: '薪资计算',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: false },
    { key: 'employee_name', label: '姓名' },
    { key: 'pay_company', label: '发薪公司' },
    { key: 'cost_center', label: '成本中心' },
    { key: 'department', label: '部门' },
    { key: 'report_to', label: '汇报人' },
    { key: 'position', label: '职位' },
    { key: 'entry_date', label: '入职日期' },
    { key: 'attendance_type', label: '考勤制' },
    { key: 'basic_salary', label: '基本工资' },
    { key: 'attendance_adjust_total', label: '考勤调整合计' },
    { key: 'additional_total', label: '附加薪酬合计' },
    { key: 'personal_welfare_total', label: '个人福利合计' },
    { key: 'company_welfare_total', label: '公司福利合计' },
    { key: 'monthly_tax', label: '当月个人所得税' },
    { key: 'insurance_amount', label: '商保金额' },
    { key: 'wage_subtotal', label: '薪资小计' },
    { key: 'net_pay', label: '实收工资' },
    { key: 'total_cost', label: '企业人力成本总计' },
    { key: 'data_status', label: '数据状态' },
  ],
};

const PayrollPage: React.FC = () => {
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

  // 审批弹窗
  const [approveModal, setApproveModal] = useState<{ type: 'submit' | 'approve' | 'reject' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => { loadData(); }, [period, fPayCompany, fCostCenter, fDepartment, keyword]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, attRes, addRes, welfareRes, taxRes] = await Promise.all([
        api.get('/employees?select=unique_hash,name,status,pay_company,cost_center,department,report_to,position,entry_date,attendance_type,basic_salary'),
        api.get(`/attendance_records?select=unique_hash,attendance_adjust_total,data_status&period=eq.${period}`),
        api.get(`/additional_salary_records?select=*&period=eq.${period}`),
        api.get(`/employee_welfare_records?select=unique_hash,personal_total,company_total&period=eq.${period}`),
        api.get(`/tax_monthly_calcs?select=unique_hash,monthly_tax&period=eq.${period}`),
      ]);

      const empList: any[] = empRes.data;
      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });
      setEmployees(empMap);

      const attMap: Record<string, any> = {};
      attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });
      const addMap: Record<string, any> = {};
      addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });
      const welfareMap: Record<string, any> = {};
      welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });
      const taxMap: Record<string, any> = {};
      taxRes.data.forEach((r: any) => { taxMap[r.unique_hash] = r; });

      let merged = empList
        .filter((e: any) => e.status === '在职')
        .map((e: any) => {
          const add = addMap[e.unique_hash] || {};
          // 附加薪酬合计 = 12项之和
          const additionalTotal = Number((
            (add.allowance_supp || 0) + (add.other_adjust || 0) + (add.insurance_amount || 0) +
            (add.kpi_provision || 0) + (add.office_comm || 0) + (add.performance_pay || 0) +
            (add.apartment_comm || 0) + (add.talent_kpi || 0) + (add.heat_allowance || 0) +
            (add.other_allowance || 0) + (add.security_bonus || 0) + (add.cleaning_bonus || 0)
          ).toFixed(2));

          const basicSalary = Number(e.basic_salary || 0);
          const attendanceAdjust = Number(attMap[e.unique_hash]?.attendance_adjust_total || 0);
          const personalWelfare = Number(welfareMap[e.unique_hash]?.personal_total || 0);
          const companyWelfare = Number(welfareMap[e.unique_hash]?.company_total || 0);
          const monthlyTax = Number(taxMap[e.unique_hash]?.monthly_tax || 0);
          const insuranceAmount = Number(add.insurance_amount || 0);

          // 薪资小计 = 基本工资 + 考勤调整合计 + 附加薪酬合计
          const wageSubtotal = Number((basicSalary + attendanceAdjust + additionalTotal).toFixed(2));
          // 实收工资 = 薪资小计 - 个人福利合计 - 当月个人所得税 - 商保金额
          const netPay = Number((wageSubtotal - personalWelfare - monthlyTax - insuranceAmount).toFixed(2));
          // 企业人力成本总计 = 薪资小计 + 公司福利合计
          const totalCost = Number((wageSubtotal + companyWelfare).toFixed(2));

          return {
            key: `emp-${e.unique_hash}`,
            unique_hash: e.unique_hash,
            employee_name: e.name,
            pay_company: e.pay_company || '',
            cost_center: e.cost_center || '',
            department: e.department || '',
            report_to: e.report_to || '',
            position: e.position || '',
            entry_date: e.entry_date || '',
            attendance_type: e.attendance_type || '',
            basic_salary: basicSalary,
            attendance_adjust_total: attendanceAdjust,
            additional_total: additionalTotal,
            personal_welfare_total: personalWelfare,
            company_welfare_total: companyWelfare,
            monthly_tax: monthlyTax,
            insurance_amount: insuranceAmount,
            wage_subtotal: wageSubtotal,
            net_pay: netPay,
            total_cost: totalCost,
            data_status: attMap[e.unique_hash]?.data_status || '未录入',
          };
        });

      // 筛选
      if (fPayCompany) merged = merged.filter((r: any) => r.pay_company === fPayCompany);
      if (fCostCenter) merged = merged.filter((r: any) => (r.cost_center || '').includes(fCostCenter));
      if (fDepartment) merged = merged.filter((r: any) => (r.department || '').includes(fDepartment));
      if (keyword) merged = merged.filter((r: any) => (r.employee_name || '').includes(keyword));

      setRecords(merged);
    } catch { message.error('加载薪资数据失败'); }
    finally { setLoading(false); }
  };

  const handleExport = () => exportXlsx(EXPORT_DEF, records, period);

  // 审批流
  const role = localStorage.getItem('user_role') || 'hr_staff';
  const isApprover = role === 'approver' || role === 'admin';
  const isOperator = role === 'hr_lead' || role === 'hr_staff' || role === 'it_staff' || role === 'admin';

  const updateTableStatus = async (table: string, status: string) => {
    try {
      await api.patch(`/${table}?period=eq.${period}`, { data_status: status });
    } catch { /* 忽略 */ }
  };

  const handleSubmit = async () => {
    setApproveModal({ type: 'submit' });
  };
  const handleApprove = async () => {
    setApproveModal({ type: 'approve' });
  };
  const handleReject = async () => {
    setRejectReason('');
    setApproveModal({ type: 'reject' });
  };

  const confirmSubmit = async () => {
    await updateTableStatus('salary_records', '已提交老板查看');
    await updateTableStatus('attendance_records', '已提交老板查看');
    await updateTableStatus('additional_salary_records', '已提交老板查看');
    message.success('已提交审批');
    setApproveModal(null);
    loadData();
  };

  const confirmApprove = async () => {
    await updateTableStatus('salary_records', '已锁定');
    await updateTableStatus('attendance_records', '已锁定');
    await updateTableStatus('employee_welfare_records', '已锁定');
    await updateTableStatus('additional_salary_records', '已锁定');
    message.success('审批通过，当月数据已冻结');
    setApproveModal(null);
    loadData();
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      message.warning('请填写退回理由');
      return;
    }
    await updateTableStatus('salary_records', '退回修改');
    await updateTableStatus('attendance_records', '退回修改');
    await updateTableStatus('additional_salary_records', '退回修改');
    message.success('已退回修改');
    setApproveModal(null);
    setRejectReason('');
    loadData();
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
    { title: withSource('基本工资', '花名册同步'), dataIndex: 'basic_salary', key: 'bs', width: 110, render: fmtMoney },
    { title: withSource('考勤调整合计', '考勤同步'), dataIndex: 'attendance_adjust_total', key: 'aat', width: 120, render: fmtMoney },
    { title: withSource('附加薪酬合计', '附加薪酬同步'), dataIndex: 'additional_total', key: 'at', width: 120, render: fmtMoney },
    { title: withSource('个人福利合计', '社保同步'), dataIndex: 'personal_welfare_total', key: 'pwt', width: 120, render: fmtMoney },
    { title: withSource('公司福利合计', '社保同步'), dataIndex: 'company_welfare_total', key: 'cwt', width: 120, render: fmtMoney },
    { title: withSource('当月个人所得税', '个税同步'), dataIndex: 'monthly_tax', key: 'mt', width: 130, render: (v: any) => <span style={{ color: '#e74c3c' }}>{fmtMoney(v)}</span> },
    { title: withSource('商保金额', '附加薪酬同步'), dataIndex: 'insurance_amount', key: 'ia', width: 100, render: fmtMoney },
    { title: withSource('薪资小计', '系统计算'), dataIndex: 'wage_subtotal', key: 'wst', width: 110, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('实收工资', '系统计算'), dataIndex: 'net_pay', key: 'np', width: 110, render: (v: any) => <strong style={{ color: '#27ae60' }}>{fmtMoney(v)}</strong> },
    { title: withSource('企业人力成本总计', '系统计算'), dataIndex: 'total_cost', key: 'tc', width: 140, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: withSource('数据状态', '系统计算'), dataIndex: 'data_status', key: 'ds', width: 100, fixed: 'right',
      render: (v: string) => <Tag color={v === '已锁定' ? 'red' : v === '已提交老板查看' ? 'gold' : 'blue'}>{v}</Tag> },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <span>月份：</span>
          <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 180 }} />
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          {isOperator && (
            <Button type="primary" icon={<SendOutlined />} onClick={handleSubmit}>提交审批</Button>
          )}
          {isApprover && (
            <>
              <Button type="primary" style={{ background: '#27ae60', borderColor: '#27ae60' }} icon={<CheckCircleOutlined />} onClick={handleApprove}>通过审批</Button>
              <Button danger icon={<RollbackOutlined />} onClick={handleReject}>退回修改</Button>
            </>
          )}
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
        <Table columns={columns} dataSource={records} loading={loading} scroll={{ x: 2400 }} size="small" pagination={{ pageSize: 30 }} />
      </div>

      {/* 审批弹窗 */}
      <Modal
        title={approveModal?.type === 'submit' ? '提交审批' : approveModal?.type === 'approve' ? '通过审批' : '退回修改'}
        open={!!approveModal}
        onOk={approveModal?.type === 'submit' ? confirmSubmit : approveModal?.type === 'approve' ? confirmApprove : confirmReject}
        onCancel={() => { setApproveModal(null); setRejectReason(''); }}
        okText="确认"
        cancelText="取消"
      >
        {approveModal?.type === 'submit' && <div>是否确认提交本月薪资数据给终审人审批？</div>}
        {approveModal?.type === 'approve' && <div>是否确认通过？确认后本月数据将冻结，仅可查看。</div>}
        {approveModal?.type === 'reject' && (
          <div>
            <div style={{ marginBottom: 8 }}>请填写退回理由：</div>
            <AntInput.TextArea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="退回理由将发送至人事专员" />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PayrollPage;
