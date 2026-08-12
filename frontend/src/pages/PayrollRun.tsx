import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, message, Input, Tag, Upload } from 'antd';
import { DownOutlined, RightOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../api/client';
import { exportXlsx, importXlsx, type ExportDef } from '../utils/importExport';

// 表头定义 — 导出时包含隐藏字段
const EXPORT_DEF: ExportDef = {
  module: '薪资计算',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: true },
    { key: 'base_salary', label: '基本工资' },
    { key: 'allowance_supp', label: '补贴/补充公积金' },
    { key: 'attendance_adjust', label: '考勤调整' },
    { key: 'other_adjust', label: '其他补贴/调整' },
    { key: 'insurance_amount', label: '商保金额' },
    { key: 'kpi_provision', label: 'KPI预提' },
    { key: 'monthly_wage', label: '本月工资' },
    { key: 'office_comm', label: '商办佣金' },
    { key: 'performance_pay', label: '绩效' },
    { key: 'apartment_comm', label: '公寓佣金' },
    { key: 'talent_kpi', label: '人才系KPI' },
    { key: 'heat_allowance', label: '防暑降温费' },
    { key: 'other_allowance', label: '津贴' },
    { key: 'security_bonus', label: '保安奖金' },
    { key: 'cleaning_bonus', label: '保洁奖金' },
    { key: 'wage_subtotal', label: '薪资小计' },
    { key: 'social_base', label: '社保基数' },
    { key: 'housing_fund_base', label: '公积金基数' },
    { key: 'pension_p', label: '个人养老' },
    { key: 'medical_p', label: '个人医疗' },
    { key: 'unemployment_p', label: '个人失业' },
    { key: 'housing_fund_p', label: '个人公积金' },
    { key: 'supp_housing_p', label: '个人补充公积金' },
    { key: 'cumul_child_edu', label: '累计子女教育' },
    { key: 'cumul_mortgage', label: '累计住房贷款利息' },
    { key: 'cumul_rent', label: '累计住房租金' },
    { key: 'cumul_elder_care', label: '累计赡养老人' },
    { key: 'cumul_continuing_edu', label: '累计继续教育' },
    { key: 'month_taxable_wage', label: '本期纳税工资' },
    { key: 'cumul_income', label: '累计收入' },
    { key: 'taxable_income', label: '应纳税所得额' },
    { key: 'cumul_tax_paid', label: '累计已扣税额' },
    { key: 'monthly_tax', label: '当月个人所得税' },
    { key: 'insurance_adjust', label: '商保调整' },
    { key: 'net_pay', label: '实收工资' },
    { key: 'pension_c', label: '公司养老' },
    { key: 'medical_c', label: '公司医疗' },
    { key: 'unemployment_c', label: '公司失业' },
    { key: 'injury_c', label: '公司工伤' },
    { key: 'maternity_c', label: '公司生育' },
    { key: 'housing_fund_c', label: '公司公积金' },
    { key: 'supp_housing_c', label: '公司补充公积金' },
    { key: 'total_cost', label: '企业人力成本总计' },
    { key: 'provision_welfare', label: '预提福利费' },
  ],
};

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const PayrollPage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, any>>({});
  const [period, setPeriod] = useState(defaultPeriod);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, salRes] = await Promise.all([
        api.get('/employees?select=unique_hash,name,company_full_name,cost_center,department,reporter,position,join_date,work_schedule,tax_type&is_active=eq.true'),
        api.get(`/salary_records?select=*&period=eq.${period}&order=unique_hash`),
      ]);

      const empMap: Record<string, any> = {};
      empRes.data.forEach((e: any) => { empMap[e.unique_hash] = e; });

      setEmployees(empMap);
      setRecords(salRes.data.map((r: any) => {
        const emp = empMap[r.unique_hash] || {};
        const personalTotal = (r.pension_p || 0) + (r.medical_p || 0) + (r.unemployment_p || 0) + (r.housing_fund_p || 0) + (r.supp_housing_p || 0);
        const companyTotal = (r.pension_c || 0) + (r.medical_c || 0) + (r.unemployment_c || 0) + (r.injury_c || 0) + (r.maternity_c || 0) + (r.housing_fund_c || 0) + (r.supp_housing_c || 0);
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
          tax_type: emp.tax_type || 'normal',
          personal_welfare_total: personalTotal,
          company_welfare_total: companyTotal,
        };
      }));
    } catch { message.error('加载薪资数据失败'); }
    finally { setLoading(false); }
  };

  const toggleExpand = (key: string, section: 'personal' | 'company') => {
    const fullKey = `${key}-${section}`;
    setExpandedKeys(prev => {
      const next = new Set(prev);
      next.has(fullKey) ? next.delete(fullKey) : next.add(fullKey);
      return next;
    });
  };

  const taxTypeMap: Record<string, string> = { normal: '累计预扣', service: '劳务20%', non_taxable: '免税' };

  const formatYuan = (v: any) => (v ?? v === 0) ? `¥${Number(v).toLocaleString('zh-CN', {minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';

  // Build columns with expandable sections
  const columns: any[] = [
    // == 基本信息 ==
    { title: '姓名', dataIndex: 'employee_name', key: 'name', width: 80, fixed: 'left' },
    { title: '发薪公司', dataIndex: 'company_full_name', key: 'co', width: 180, ellipsis: true, fixed: 'left' },
    { title: '成本中心', dataIndex: 'cost_center', key: 'cc', width: 80 },
    { title: '部门', dataIndex: 'department', key: 'dept', width: 80 },
    { title: '汇报人', dataIndex: 'reporter', key: 'rpt', width: 70 },
    { title: '职位', dataIndex: 'position', key: 'pos', width: 80 },
    { title: '入职日期', dataIndex: 'join_date', key: 'jd', width: 90 },
    { title: '考勤制', dataIndex: 'work_schedule', key: 'ws', width: 80, render: (v:string) => <Tag>{v}</Tag> },
    { title: '计税方式', dataIndex: 'tax_type', key: 'tax', width: 90, render: (v:string) => <Tag color={v==='normal'?'blue':v==='service'?'orange':'green'}>{taxTypeMap[v] || v}</Tag> },

    // == 收入项 ==
    { title: '基本工资', dataIndex: 'base_salary', key: 'bs', width: 100, render: formatYuan },
    { title: '补贴/补公积金', dataIndex: 'allowance_supp', key: 'as', width: 110, render: formatYuan },
    { title: '考勤调整', dataIndex: 'attendance_adjust', key: 'aa', width: 90, render: formatYuan },
    { title: '其他补贴/调整', dataIndex: 'other_adjust', key: 'oa', width: 110, render: formatYuan },
    { title: '商保金额', dataIndex: 'insurance_amount', key: 'ia', width: 90, render: formatYuan },
    { title: 'KPI预提', dataIndex: 'kpi_provision', key: 'kp', width: 90, render: formatYuan },
    { title: '本月工资', dataIndex: 'monthly_wage', key: 'mw', width: 100, render: formatYuan },
    { title: '商办佣金', dataIndex: 'office_comm', key: 'oc', width: 90, render: formatYuan },
    { title: '绩效', dataIndex: 'performance_pay', key: 'pp', width: 90, render: formatYuan },
    { title: '公寓佣金', dataIndex: 'apartment_comm', key: 'ac', width: 90, render: formatYuan },
    { title: '人才系KPI', dataIndex: 'talent_kpi', key: 'tk', width: 90, render: formatYuan },
    { title: '防暑降温费', dataIndex: 'heat_allowance', key: 'ha', width: 100, render: formatYuan },
    { title: '津贴', dataIndex: 'other_allowance', key: 'oal', width: 80, render: formatYuan },
    { title: '保安奖金', dataIndex: 'security_bonus', key: 'sb', width: 90, render: formatYuan },
    { title: '保洁奖金', dataIndex: 'cleaning_bonus', key: 'cb', width: 90, render: formatYuan },
    { title: '薪资小计', dataIndex: 'wage_subtotal', key: 'wst', width: 100, render: (v:any) => <strong>{formatYuan(v)}</strong> },

    // == 社保基数 ==
    { title: '社保基数', dataIndex: 'social_base', key: 'sbase', width: 90, render: formatYuan },
    { title: '公积金基数', dataIndex: 'housing_fund_base', key: 'hbase', width: 90, render: formatYuan },

    // == 个人福利合计 + 展开三角 ==
    {
      title: '个人福利合计',
      dataIndex: 'personal_welfare_total',
      key: 'pwt',
      width: 120,
      render: (v: number, r: any) => {
        const expanded = expandedKeys.has(`${r.key}-personal`);
        const Icon = expanded ? DownOutlined : RightOutlined;
        return (
          <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleExpand(r.key, 'personal')}>
            <strong>{formatYuan(v)}</strong>
            {' '}
            <Icon style={{ fontSize: 10, color: '#999' }} />
          </span>
        );
      },
    },
    // 个人福利明细（条件展示）
    ...(records.length === 0 ? [] : ['pension_p', 'medical_p', 'unemployment_p', 'housing_fund_p', 'supp_housing_p'].map(field => ({
      title: ({ 'pension_p': '个人养老', 'medical_p': '个人医疗', 'unemployment_p': '个人失业', 'housing_fund_p': '个人公积金', 'supp_housing_p': '个人补充公积金' } as any)[field],
      dataIndex: field,
      key: field,
      width: 110,
      render: (v: any, r: any) => expandedKeys.has(`${r.key}-personal`) ? formatYuan(v) : '',
    }))),

    // == 当月个税 ==
    { title: '当月个人所得税', dataIndex: 'monthly_tax', key: 'mt', width: 120, render: (v:any) => <strong style={{color:'#e74c3c'}}>{formatYuan(v)}</strong> },
    { title: '商保调整', dataIndex: 'insurance_adjust', key: 'iad', width: 90, render: formatYuan },
    { title: '实收工资', dataIndex: 'net_pay', key: 'np', width: 100, render: (v:any) => <strong style={{color:'#27ae60'}}>{formatYuan(v)}</strong> },

    // == 公司福利合计 + 展开三角 ==
    {
      title: '公司法定福利合计',
      dataIndex: 'company_welfare_total',
      key: 'cwt',
      width: 130,
      render: (v: number, r: any) => {
        const expanded = expandedKeys.has(`${r.key}-company`);
        const Icon = expanded ? DownOutlined : RightOutlined;
        return (
          <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleExpand(r.key, 'company')}>
            <strong>{formatYuan(v)}</strong>
            {' '}
            <Icon style={{ fontSize: 10, color: '#999' }} />
          </span>
        );
      },
    },
    // 公司福利明细（条件展示）
    ...(records.length === 0 ? [] : ['pension_c', 'medical_c', 'unemployment_c', 'injury_c', 'maternity_c', 'housing_fund_c', 'supp_housing_c'].map(field => ({
      title: ({ 'pension_c': '公司养老', 'medical_c': '公司医疗', 'unemployment_c': '公司失业', 'injury_c': '公司工伤', 'maternity_c': '公司生育', 'housing_fund_c': '公司公积金', 'supp_housing_c': '公司补充公积金' } as any)[field],
      dataIndex: field,
      key: field,
      width: 100,
      render: (v: any, r: any) => expandedKeys.has(`${r.key}-company`) ? formatYuan(v) : '',
    }))),

    // == 企业成本 ==
    { title: '企业人力成本总计', dataIndex: 'total_cost', key: 'tc', width: 130, render: (v:any) => <strong>{formatYuan(v)}</strong> },
    { title: '预提福利费', dataIndex: 'provision_welfare', key: 'pw', width: 100, render: formatYuan },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <span>月份：</span>
          <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 200 }} />
          <Button icon={<DownloadOutlined />} onClick={() => exportXlsx(EXPORT_DEF, records, period)}>导出</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={async (file) => {
            try {
              const { data, import_errors } = await importXlsx(EXPORT_DEF, file);
              if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
              if (data.length === 0) { message.info('未找到有效数据'); return false; }
              let success = 0;
              for (const row of data) {
                try {
                  const existing = await api.get(`/salary_records?unique_hash=eq.${row.unique_hash}&period=eq.${period}`);
                  if (existing.data.length > 0) {
                    await api.patch(`/salary_records?id=eq.${existing.data[0].id}`, { ...row, period, month_number: parseInt(period.split('-')[1]) || 1 });
                  } else {
                    await api.post('/salary_records', { ...row, period, month_number: parseInt(period.split('-')[1]) || 1 });
                  }
                  success++;
                } catch { /* skip */ }
              }
              message.success(`导入完成：${success} / ${data.length} 条`);
              loadData();
            } catch (e: any) { message.error(e.message || '导入失败'); }
            return false;
          }}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={records}
        loading={loading}
        scroll={{ x: 5200 }}
        size="small"
        pagination={{ pageSize: 30 }}
      />
    </div>
  );
};

export default PayrollPage;
