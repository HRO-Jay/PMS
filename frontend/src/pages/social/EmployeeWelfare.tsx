import React, { useEffect, useState } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, Space, message, Card, InputNumber, Switch, Tag, Descriptions, DatePicker, Upload, Dropdown, Popconfirm,
} from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../../api/client';
import type { SocialWelfareSet, HousingFundSet, EmployeeWelfareRecord } from '../../types';
import { calcSocial, calcHousingFund } from '../../utils/welfareCalc';
import { exportXlsx, importXlsx, type ExportDef } from '../../utils/importExport';
import dayjs from 'dayjs';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const SOCIAL_NO_REASONS = ['退休返聘', '实习或劳务关系', '异地缴纳', '其他单位缴纳', '其他'];
const HOUSING_NO_REASONS = ['异地缴纳', '其他单位缴纳', '其他'];

// 金额格式化：固定两位小数
const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '') return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 导出表头定义
const EXPORT_DEF: ExportDef = {
  module: '员工福利缴纳明细',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: true },
    { key: 'employee_name', label: '姓名', required: true },
    { key: 'pay_company', label: '发薪公司', required: true },
    { key: 'department', label: '部门' },
    { key: 'effective_month', label: '生效日期' },
    { key: 'expiry_month', label: '结束日期' },
    { key: 'social_welfare_code', label: '社保福利套', required: true },
    { key: 'housing_fund_code', label: '公积金福利套', required: true },
    { key: 'social_base', label: '社保基数' },
    { key: 'housing_base', label: '公积金基数' },
    { key: 'supp_enabled', label: '是否缴纳补充公积金' },
    { key: 'supp_base', label: '补充公积金基数' },
    { key: 'social_no_reason', label: '社保不缴纳原因' },
    { key: 'housing_no_reason', label: '公积金不缴纳原因' },
  ],
};

const EmployeeWelfare: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [socialSets, setSocialSets] = useState<SocialWelfareSet[]>([]);
  const [housingSets, setHousingSets] = useState<HousingFundSet[]>([]);
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [formValues, setFormValues] = useState<any>({});

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, sRes, hRes, recRes] = await Promise.all([
        api.get('/employees?select=unique_hash,name,pay_company,department'),
        api.get('/social_welfare_sets?select=*&order=code'),
        api.get('/housing_fund_sets?select=*&order=code'),
        api.get(`/employee_welfare_records?select=*&period=eq.${period}`),
      ]);
      setEmployees(empRes.data);
      setSocialSets(sRes.data);
      setHousingSets(hRes.data);

      const empMap: Record<string, any> = {};
      empRes.data.forEach((e: any) => { empMap[e.unique_hash] = e; });

      setRecords(recRes.data.map((r: any) => {
        const emp = empMap[r.unique_hash] || {};
        // 含调整合计算
        const psAdj = Number(r.personal_social_adj || 0);
        const csAdj = Number(r.company_social_adj || 0);
        const phAdj = Number(r.personal_housing_adj || 0);
        const chAdj = Number(r.company_housing_adj || 0);
        const socialAdjTotal = Number((psAdj + csAdj).toFixed(2));
        const housingAdjTotal = Number((phAdj + chAdj).toFixed(2));
        const psWithAdj = Number(((r.personal_social_total || 0) + psAdj).toFixed(2));
        const csWithAdj = Number(((r.company_social_total || 0) + csAdj).toFixed(2));
        const phWithAdj = Number(((r.personal_housing_total || 0) + phAdj).toFixed(2));
        const chWithAdj = Number(((r.company_housing_total || 0) + chAdj).toFixed(2));
        return {
          ...r,
          key: r.id,
          employee_name: emp.name || r.unique_hash,
          pay_company: emp.pay_company || '',
          department: emp.department || '',
          social_adj_total: socialAdjTotal,
          housing_adj_total: housingAdjTotal,
          personal_social_with_adj: psWithAdj,
          company_social_with_adj: csWithAdj,
          personal_housing_with_adj: phWithAdj,
          company_housing_with_adj: chWithAdj,
          social_total_with_adj: Number((psWithAdj + csWithAdj).toFixed(2)),
          housing_total_with_adj: Number((phWithAdj + chWithAdj).toFixed(2)),
          personal_total_with_adj: Number((psWithAdj + phWithAdj).toFixed(2)),
          company_total_with_adj: Number((csWithAdj + chWithAdj).toFixed(2)),
        };
      }));
    } catch { message.error('加载数据失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ period, supp_enabled: false });
    setFormValues({});
    setEditOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({ ...record });
    setFormValues({ ...record });
    setEditOpen(true);
  };

  const onFormChange = (_: any, allValues: any) => {
    setFormValues(allValues);
  };

  // 实时计算
  const handleCalc = () => {
    const v = formValues;
    if (!v.social_welfare_code || !v.housing_fund_code) {
      message.warning('请先选择社保和公积金福利套');
      return;
    }
    const sSet = socialSets.find(s => s.code === v.social_welfare_code);
    const hSet = housingSets.find(h => h.code === v.housing_fund_code);
    if (!sSet || !hSet) { message.error('未找到福利套'); return; }

    const socialBase = Number(v.social_base || 0);
    const housingBase = Number(v.housing_base || 0);
    const suppBase = Number(v.supp_base || housingBase);

    const social = sSet.code === 'SI-00' ? null : calcSocial(sSet as any, socialBase);
    const housing = hSet.code === 'HF-00' ? null : calcHousingFund(hSet as any, housingBase, suppBase, v.supp_enabled);

    // 组装计算结果
    const result: any = {
      pension_p_amt: social?.pension_p || 0,
      medical_p_amt: social?.medical_p || 0,
      unemployment_p_amt: social?.unemployment_p || 0,
      pension_c_amt: social?.pension_c || 0,
      medical_c_amt: social?.medical_c || 0,
      unemployment_c_amt: social?.unemployment_c || 0,
      injury_c_amt: social?.injury_c || 0,
      maternity_c_amt: social?.maternity_c || 0,
      normal_housing_p_amt: housing?.normal_p || 0,
      normal_housing_c_amt: housing?.normal_c || 0,
      supp_housing_p_amt: housing?.supp_p || 0,
      supp_housing_c_amt: housing?.supp_c || 0,
      personal_social_total: social?.personal_total || 0,
      personal_housing_total: housing?.personal_total || 0,
      company_social_total: social?.company_total || 0,
      company_housing_total: housing?.company_total || 0,
    };
    result.personal_total = Number((result.personal_social_total + result.personal_housing_total).toFixed(2));
    result.company_total = Number((result.company_social_total + result.company_housing_total).toFixed(2));

    // 调整金额（手工导入，不参与本月计算）
    const psAdj = Number(v.personal_social_adj || 0);
    const csAdj = Number(v.company_social_adj || 0);
    const phAdj = Number(v.personal_housing_adj || 0);
    const chAdj = Number(v.company_housing_adj || 0);

    // 含调整合计
    result.personal_social_adj = Number(psAdj.toFixed(2));
    result.company_social_adj = Number(csAdj.toFixed(2));
    result.personal_housing_adj = Number(phAdj.toFixed(2));
    result.company_housing_adj = Number(chAdj.toFixed(2));
    result.social_adj_total = Number((psAdj + csAdj).toFixed(2));       // 社保调整金额
    result.housing_adj_total = Number((phAdj + chAdj).toFixed(2));      // 公积金调整金额
    result.personal_social_with_adj = Number((result.personal_social_total + psAdj).toFixed(2));
    result.company_social_with_adj = Number((result.company_social_total + csAdj).toFixed(2));
    result.personal_housing_with_adj = Number((result.personal_housing_total + phAdj).toFixed(2));
    result.company_housing_with_adj = Number((result.company_housing_total + chAdj).toFixed(2));
    result.social_total_with_adj = Number((result.personal_social_with_adj + result.company_social_with_adj).toFixed(2));
    result.housing_total_with_adj = Number((result.personal_housing_with_adj + result.company_housing_with_adj).toFixed(2));
    result.personal_total_with_adj = Number((result.personal_social_with_adj + result.personal_housing_with_adj).toFixed(2));
    result.company_total_with_adj = Number((result.company_social_with_adj + result.company_housing_with_adj).toFixed(2));
    result.grand_total_with_adj = Number((result.personal_total_with_adj + result.company_total_with_adj).toFixed(2));

    // 状态校验
    let data_status = '正常';
    if (v.social_welfare_code !== 'SI-00' && !v.social_base) data_status = '社保基数缺失';
    else if (v.housing_fund_code !== 'HF-00' && !v.housing_base) data_status = '公积金基数缺失';
    else if (v.supp_enabled && !v.supp_base) data_status = '补充公积金基数缺失';
    else if (v.social_welfare_code === 'SI-00' && !v.social_no_reason) data_status = '不缴纳原因缺失';
    else if (v.housing_fund_code === 'HF-00' && !v.housing_no_reason) data_status = '不缴纳原因缺失';
    else if (psAdj !== 0 || csAdj !== 0 || phAdj !== 0 || chAdj !== 0) {
      if (!v.adj_reason) data_status = '调整原因缺失';
      else if (!v.adj_start_month || !v.adj_end_month) data_status = '调整期间缺失';
      else data_status = '含调整';
    }

    // 回填到表单
    form.setFieldsValue({ ...result, data_status });
    setFormValues({ ...v, ...result, data_status });
    message.success('计算完成');
  };

  const handleSave = async () => {
    await form.validateFields();
    const values = formValues;
    const payload = {
      ...values,
      period,
      social_status: values.social_welfare_code === 'SI-00' ? '不参保' : '参保',
      housing_status: values.housing_fund_code === 'HF-00' ? '不缴存' : '缴存',
      last_calc_time: new Date().toISOString(),
    };
    try {
      if (editing) {
        await api.patch(`/employee_welfare_records?id=eq.${editing.id}`, payload);
        message.success('已更新');
      } else {
        await api.post('/employee_welfare_records', payload);
        message.success('已保存');
      }
      setEditOpen(false);
      loadData();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  const openDetail = (record: any) => {
    setDetailRecord(record);
    setDetailOpen(true);
  };

  // ====== 导出 ======
  const handleExport = (mode: 'template' | 'full') => {
    if (mode === 'template') {
      exportXlsx(EXPORT_DEF, [], period);
    } else {
      exportXlsx(EXPORT_DEF, records, period);
    }
  };

  // ====== 导入（增量：有唯一值→更新，无唯一值→新增） ======
  const handleImport = async (file: File) => {
    try {
      const { data, import_errors } = await importXlsx(EXPORT_DEF, file);
      if (import_errors.length > 0) message.warning(`有 ${import_errors.length} 行数据存在问题`);
      if (data.length === 0) { message.info('未找到有效数据'); return; }

      let added = 0, updated = 0, failed = 0;
      const failReasons: string[] = [];

      for (const row of data) {
        try {
          if (!row.unique_hash) {
            failed++;
            failReasons.push('缺唯一值（该行可能是新增员工，请先在花名册添加）');
            continue;
          }
          const existing = await api.get(`/employee_welfare_records?unique_hash=eq.${row.unique_hash}&period=eq.${period}`);
          // 剔除展示字段（姓名/公司/部门不属于数据库表，仅供导出查看）
          const { employee_name, pay_company, department, ...dbRow } = row;
          const payload = {
            ...dbRow,
            period,
            supp_enabled: String(row.supp_enabled).toLowerCase() === 'true' || row.supp_enabled === '是' || row.supp_enabled === 1,
          };
          if (existing.data.length > 0) {
            await api.patch(`/employee_welfare_records?id=eq.${existing.data[0].id}`, payload);
            updated++;
          } else {
            await api.post('/employee_welfare_records', payload);
            added++;
          }
        } catch {
          failed++;
        }
      }
      message.info(`导入完成：新增 ${added}，更新 ${updated}，失败 ${failed}${failReasons.length ? '。' + failReasons.slice(0, 5).join('；') : ''}`);
      loadData();
    } catch (e: any) {
      message.error(e.message || '导入失败');
    }
  };

  const statusTag = (s: string) => {
    const color = s === '正常' ? 'green' : 'orange';
    return <Tag color={color}>{s}</Tag>;
  };

  const columns: any[] = [
    { title: '姓名', dataIndex: 'employee_name', key: 'name', width: 90, fixed: 'left' },
    { title: '公司/部门', key: 'org', width: 160, render: (_: any, r: any) => `${r.pay_company} / ${r.department || '—'}` },
    { title: '生效日期', dataIndex: 'effective_month', key: 'em', width: 100, render: (v: string) => v || '—' },
    { title: '结束日期', dataIndex: 'expiry_month', key: 'xm', width: 100, render: (v: string) => v || '—' },
    { title: '社保福利套', dataIndex: 'social_welfare_code', key: 'sw', width: 120 },
    { title: '公积金福利套', dataIndex: 'housing_fund_code', key: 'hw', width: 120 },
    { title: '社保状态', dataIndex: 'social_status', key: 'ss', width: 90, render: (v: string) => <Tag color={v === '参保' ? 'green' : 'red'}>{v}</Tag> },
    { title: '公积金状态', dataIndex: 'housing_status', key: 'hs', width: 90, render: (v: string) => <Tag color={v === '缴存' ? 'green' : 'red'}>{v}</Tag> },
    { title: '社保基数', dataIndex: 'social_base', key: 'sb', width: 100, render: (v: any) => v ? `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' },
    { title: '公积金基数', dataIndex: 'housing_base', key: 'hb', width: 100, render: (v: any) => v ? `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' },
    { title: '个人合计', dataIndex: 'personal_total', key: 'pt', width: 100, render: (v: any) => <strong>¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> },
    { title: '公司合计', dataIndex: 'company_total', key: 'ct', width: 100, render: (v: any) => <strong>¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> },
    { title: '个人社保本月', dataIndex: 'personal_social_total', key: 'psm', width: 110, render: (v: any) => fmtMoney(v) },
    { title: '公司社保本月', dataIndex: 'company_social_total', key: 'csm', width: 110, render: (v: any) => fmtMoney(v) },
    { title: '社保调整金额', dataIndex: 'social_adj_total', key: 'sat', width: 110, render: (v: any) => fmtMoney(v) },
    { title: '社保合计(含调整)', dataIndex: 'social_total_with_adj', key: 'stwa', width: 130, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: '公积金调整金额', dataIndex: 'housing_adj_total', key: 'hat', width: 120, render: (v: any) => fmtMoney(v) },
    { title: '公积金合计(含调整)', dataIndex: 'housing_total_with_adj', key: 'htwa', width: 130, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: '个人福利合计(含调整)', dataIndex: 'personal_total_with_adj', key: 'ptwa', width: 140, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: '公司福利合计(含调整)', dataIndex: 'company_total_with_adj', key: 'ctwa', width: 140, render: (v: any) => <strong>{fmtMoney(v)}</strong> },
    { title: '数据状态', dataIndex: 'data_status', key: 'ds', width: 100, render: statusTag },
    {
      title: '操作', key: 'act', width: 120, fixed: 'right',
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" onClick={() => openDetail(r)}>查看</Button>
          <Button size="small" onClick={() => openEdit(r)}>编辑</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <span>薪酬月份：</span>
          <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 180 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加记录</Button>
          <Dropdown menu={{
            items: [
              { key: 'template', label: '导出空白模板' },
              { key: 'full', label: '导出全量数据' },
            ],
            onClick: ({ key }) => handleExport(key as 'template' | 'full'),
          }}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { handleImport(file); return false; }}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
        </Space>
      </Card>

      <Table columns={columns} dataSource={records} loading={loading} scroll={{ x: 1400 }} size="small" pagination={{ pageSize: 50 }} />

      {/* 编辑抽屉 */}
      <Drawer
        title={editing ? '编辑员工福利缴纳' : '添加员工福利缴纳'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={680}
        extra={
          <Space>
            <Button onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={handleCalc}>计算</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onValuesChange={onFormChange}>
          <Form.Item name="unique_hash" label="员工" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择员工"
              options={employees.map((e: any) => ({ value: e.unique_hash, label: `${e.name} — ${e.pay_company}` }))} />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="effective_month" label="生效月份">
              <Input type="month" style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="expiry_month" label="结束月份">
              <Input type="month" style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="social_welfare_code" label="社保福利套" rules={[{ required: true }]}>
              <Select style={{ width: 220 }} options={socialSets.map(s => ({ value: s.code, label: `${s.code} ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="housing_fund_code" label="公积金福利套" rules={[{ required: true }]}>
              <Select style={{ width: 220 }} options={housingSets.map(h => ({ value: h.code, label: `${h.code} ${h.name}` }))} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="social_base" label="社保基数">
              <InputNumber style={{ width: 180 }} min={0} />
            </Form.Item>
            <Form.Item name="housing_base" label="公积金基数">
              <InputNumber style={{ width: 180 }} min={0} />
            </Form.Item>
          </Space>
          <Form.Item name="supp_enabled" label="是否缴纳补充公积金" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="supp_base" label="补充公积金基数">
            <InputNumber style={{ width: 180 }} min={0} />
          </Form.Item>

          {/* 不缴纳原因 */}
          {formValues.social_welfare_code === 'SI-00' && (
            <Form.Item name="social_no_reason" label="社保不缴纳原因" rules={[{ required: true }]}>
              <Select options={SOCIAL_NO_REASONS.map(r => ({ value: r, label: r }))} />
            </Form.Item>
          )}
          {formValues.housing_fund_code === 'HF-00' && (
            <Form.Item name="housing_no_reason" label="公积金不缴纳原因" rules={[{ required: true }]}>
              <Select options={HOUSING_NO_REASONS.map(r => ({ value: r, label: r }))} />
            </Form.Item>
          )}

          {/* 调整金额 */}
          <Card title="调整金额（手工导入，非0需填原因和期间）" size="small" style={{ marginBottom: 12 }}>
            <Space style={{ width: '100%' }} size="large">
              <Form.Item name="personal_social_adj" label="个人社保调整">
                <InputNumber style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="company_social_adj" label="公司社保调整">
                <InputNumber style={{ width: 140 }} />
              </Form.Item>
            </Space>
            <Space style={{ width: '100%' }} size="large">
              <Form.Item name="personal_housing_adj" label="个人公积金调整">
                <InputNumber style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="company_housing_adj" label="公司公积金调整">
                <InputNumber style={{ width: 140 }} />
              </Form.Item>
            </Space>
            <Space style={{ width: '100%' }} size="large">
              <Form.Item name="adj_start_month" label="调整开始月份">
                <Input type="month" style={{ width: 150 }} />
              </Form.Item>
              <Form.Item name="adj_end_month" label="调整结束月份">
                <Input type="month" style={{ width: 150 }} />
              </Form.Item>
            </Space>
            <Form.Item name="adj_reason" label="调整原因">
              <Input placeholder="如：七月、八月社保公积金基数调整" />
            </Form.Item>
            <Form.Item name="adj_remark" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Card>

          {/* 计算结果展示 */}
          {formValues.personal_total !== undefined && (
            <Card title="计算结果（含调整）" size="small" style={{ background: '#fafafa' }}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="个人社保本月">{fmtMoney(formValues.personal_social_total)}</Descriptions.Item>
                <Descriptions.Item label="个人公积金本月">{fmtMoney(formValues.personal_housing_total)}</Descriptions.Item>
                <Descriptions.Item label="个人社保调整">{fmtMoney(formValues.personal_social_adj)}</Descriptions.Item>
                <Descriptions.Item label="个人公积金调整">{fmtMoney(formValues.personal_housing_adj)}</Descriptions.Item>
                <Descriptions.Item label="个人合计(含调整)"><strong>{fmtMoney(formValues.personal_total_with_adj)}</strong></Descriptions.Item>
                <Descriptions.Item label="公司社保本月">{fmtMoney(formValues.company_social_total)}</Descriptions.Item>
                <Descriptions.Item label="公司公积金本月">{fmtMoney(formValues.company_housing_total)}</Descriptions.Item>
                <Descriptions.Item label="公司社保调整">{fmtMoney(formValues.company_social_adj)}</Descriptions.Item>
                <Descriptions.Item label="公司公积金调整">{fmtMoney(formValues.company_housing_adj)}</Descriptions.Item>
                <Descriptions.Item label="公司合计(含调整)"><strong>{fmtMoney(formValues.company_total_with_adj)}</strong></Descriptions.Item>
              </Descriptions>
            </Card>
          )}
        </Form>
        {editing && (
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Popconfirm
              title="确认删除该记录？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                await api.delete(`/employee_welfare_records?id=eq.${editing.id}`);
                message.success('已删除');
                setEditOpen(false);
                loadData();
              }}
            >
              <Button danger size="small">删除该记录</Button>
            </Popconfirm>
          </div>
        )}
      </Drawer>

      {/* 详情抽屉 */}
      <Drawer
        title="员工福利缴纳详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={680}
      >
        {detailRecord && (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="姓名">{detailRecord.employee_name}</Descriptions.Item>
            <Descriptions.Item label="公司">{detailRecord.pay_company}</Descriptions.Item>
            <Descriptions.Item label="社保福利套">{detailRecord.social_welfare_code}</Descriptions.Item>
            <Descriptions.Item label="公积金福利套">{detailRecord.housing_fund_code}</Descriptions.Item>
            <Descriptions.Item label="社保状态">{detailRecord.social_status}</Descriptions.Item>
            <Descriptions.Item label="公积金状态">{detailRecord.housing_status}</Descriptions.Item>
            <Descriptions.Item label="社保基数">{fmtMoney(detailRecord.social_base)}</Descriptions.Item>
            <Descriptions.Item label="公积金基数">{fmtMoney(detailRecord.housing_base)}</Descriptions.Item>
            <Descriptions.Item label="个人养老">{fmtMoney(detailRecord.pension_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="个人医疗">{fmtMoney(detailRecord.medical_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="个人失业">{fmtMoney(detailRecord.unemployment_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司养老">{fmtMoney(detailRecord.pension_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司医疗">{fmtMoney(detailRecord.medical_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司失业">{fmtMoney(detailRecord.unemployment_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司工伤">{fmtMoney(detailRecord.injury_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="公司生育">{fmtMoney(detailRecord.maternity_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="正常公积金个人">{fmtMoney(detailRecord.normal_housing_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="正常公积金公司">{fmtMoney(detailRecord.normal_housing_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="补充公积金个人">{fmtMoney(detailRecord.supp_housing_p_amt)}</Descriptions.Item>
            <Descriptions.Item label="补充公积金公司">{fmtMoney(detailRecord.supp_housing_c_amt)}</Descriptions.Item>
            <Descriptions.Item label="个人合计"><strong>{fmtMoney(detailRecord.personal_total)}</strong></Descriptions.Item>
            <Descriptions.Item label="公司合计"><strong>{fmtMoney(detailRecord.company_total)}</strong></Descriptions.Item>

            {/* 调整金额 */}
            <Descriptions.Item label="个人社保调整">{fmtMoney(detailRecord.personal_social_adj)}</Descriptions.Item>
            <Descriptions.Item label="公司社保调整">{fmtMoney(detailRecord.company_social_adj)}</Descriptions.Item>
            <Descriptions.Item label="个人公积金调整">{fmtMoney(detailRecord.personal_housing_adj)}</Descriptions.Item>
            <Descriptions.Item label="公司公积金调整">{fmtMoney(detailRecord.company_housing_adj)}</Descriptions.Item>
            <Descriptions.Item label="社保调整金额">{fmtMoney(detailRecord.social_adj_total)}</Descriptions.Item>
            <Descriptions.Item label="公积金调整金额">{fmtMoney(detailRecord.housing_adj_total)}</Descriptions.Item>
            <Descriptions.Item label="调整期间">{detailRecord.adj_start_month || '—'} 至 {detailRecord.adj_end_month || '—'}</Descriptions.Item>
            <Descriptions.Item label="调整原因">{detailRecord.adj_reason || '—'}</Descriptions.Item>
            <Descriptions.Item label="个人合计(含调整)"><strong>{fmtMoney(detailRecord.personal_total_with_adj)}</strong></Descriptions.Item>
            <Descriptions.Item label="公司合计(含调整)"><strong>{fmtMoney(detailRecord.company_total_with_adj)}</strong></Descriptions.Item>
            <Descriptions.Item label="数据状态" span={2}>{statusTag(detailRecord.data_status)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default EmployeeWelfare;
