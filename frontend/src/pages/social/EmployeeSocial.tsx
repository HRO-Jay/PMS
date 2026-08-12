import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Card, InputNumber, Upload } from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import type { SocialRecord, Employee } from '../../types';

// 直接用原始 fetch 工具，Supabase PostgREST 查询
import api from '../../api/client';
import { exportXlsx, importXlsx, type ExportDef } from '../../utils/importExport';

// 表头定义
const EXPORT_DEF: ExportDef = {
  module: '员工社保管理',
  columns: [
    { key: 'unique_hash', label: '唯一值', hidden: true },
    { key: 'welfare_set', label: '福利套', required: true },
    { key: 'social_base', label: '社保基数' },
    { key: 'housing_fund_base', label: '公积金基数' },
    { key: 'pension_p', label: '个人养老' },
    { key: 'medical_p', label: '个人医疗' },
    { key: 'unemployment_p', label: '个人失业' },
    { key: 'housing_fund_p', label: '个人公积金' },
    { key: 'supp_housing_p', label: '个人补充公积金' },
    { key: 'pension_c', label: '公司养老' },
    { key: 'medical_c', label: '公司医疗' },
    { key: 'unemployment_c', label: '公司失业' },
    { key: 'injury_c', label: '公司工伤' },
    { key: 'maternity_c', label: '公司生育' },
    { key: 'housing_fund_c', label: '公司公积金' },
    { key: 'supp_housing_c', label: '公司补充公积金' },
  ],
};

const EmployeeSocial: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [welfareSets, setWelfareSets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('2026-08');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 加载员工列表
      const empRes = await api.get('/employees?select=unique_hash,name,company_full_name&is_active=eq.true');
      setEmployees(empRes.data);

      // 加载福利套列表
      const wsRes = await api.get('/welfare_sets?select=name');
      setWelfareSets(wsRes.data.map((w:any) => w.name));

      // 加载本月社保记录
      const recRes = await api.get(`/social_records?select=*&period=eq.${period}`);
      // 关联员工姓名
      const empMap: Record<string, string> = {};
      empRes.data.forEach((e: any) => { empMap[e.unique_hash] = e.name + ' | ' + e.company_full_name; });

      setRecords(recRes.data.map((r: any) => ({
        ...r,
        key: r.id,
        display_name: empMap[r.unique_hash] || r.unique_hash,
        personal_total: (r.pension_p || 0) + (r.medical_p || 0) + (r.unemployment_p || 0) + (r.housing_fund_p || 0) + (r.supp_housing_p || 0),
        company_total: (r.pension_c || 0) + (r.medical_c || 0) + (r.unemployment_c || 0) + (r.injury_c || 0) + (r.maternity_c || 0) + (r.housing_fund_c || 0) + (r.supp_housing_c || 0),
      })));
    } catch { message.error('加载数据失败'); }
    finally { setLoading(false); }
  };

  const openAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({ period });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const emp = employees.find((e: any) => e.unique_hash === values.unique_hash);
    try {
      const payload = { ...values, period };
      if (editingRecord) {
        await api.patch(`/social_records?id=eq.${editingRecord.id}`, payload);
        message.success('已更新');
      } else {
        await api.post('/social_records', payload);
        message.success('已添加');
      }
      setModalOpen(false);
      loadData();
    } catch { message.error('操作失败'); }
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
          // upsert: 先查是否已存在，有则更新
          const existing = await api.get(`/social_records?unique_hash=eq.${row.unique_hash}&period=eq.${period}`);
          if (existing.data.length > 0) {
            await api.patch(`/social_records?id=eq.${existing.data[0].id}`, { ...row, period });
          } else {
            await api.post('/social_records', { ...row, period });
          }
          success++;
        } catch { /* skip */ }
      }
      message.success(`导入完成：${success} / ${data.length} 条`);
      loadData();
    } catch (e: any) { message.error(e.message || '导入失败'); }
  };

  const columns = [
    { title: '姓名', dataIndex: 'display_name', key: 'name', width: 180 },
    { title: '福利套', dataIndex: 'welfare_set', key: 'ws', width: 100 },
    { title: '社保基数', dataIndex: 'social_base', key: 'sb', width: 100, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '公积金基数', dataIndex: 'housing_fund_base', key: 'hb', width: 100, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '个人养老', dataIndex: 'pension_p', key: 'pp', width: 90, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '个人医疗', dataIndex: 'medical_p', key: 'pm', width: 90, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '个人失业', dataIndex: 'unemployment_p', key: 'pu', width: 90, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '个人公积金', dataIndex: 'housing_fund_p', key: 'ph', width: 100, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '个人补充公积金', dataIndex: 'supp_housing_p', key: 'psh', width: 120, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '个人合计', dataIndex: 'personal_total', key: 'pt', width: 100, render: (v:any) => <strong>¥{Number(v).toLocaleString()}</strong> },
    { title: '公司养老', dataIndex: 'pension_c', key: 'cp', width: 90, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '公司医疗', dataIndex: 'medical_c', key: 'cm', width: 90, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '公司失业', dataIndex: 'unemployment_c', key: 'cu', width: 90, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '公司工伤', dataIndex: 'injury_c', key: 'ci', width: 90, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '公司生育', dataIndex: 'maternity_c', key: 'cm2', width: 90, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '公司公积金', dataIndex: 'housing_fund_c', key: 'ch', width: 100, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '公司补充公积金', dataIndex: 'supp_housing_c', key: 'csh', width: 120, render: (v:any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '公司合计', dataIndex: 'company_total', key: 'ct', width: 100, render: (v:any) => <strong>¥{Number(v).toLocaleString()}</strong> },
    {
      title: '操作', key: 'actions', width: 80, fixed: 'right' as const,
      render: (_:any, r:any) => <Button size="small" onClick={() => { setEditingRecord(r); form.setFieldsValue(r); setModalOpen(true); }}>编辑</Button>,
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <span>月份：</span>
          <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 200 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加社保记录</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { handleImport(file); return false; }}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={records}
        loading={loading}
        scroll={{ x: 2200 }}
        size="small"
        pagination={{ pageSize: 50 }}
      />

      <Modal
        title={editingRecord ? '编辑社保记录' : '添加社保记录'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={640}
        okText="保存" cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="unique_hash" label="员工" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择员工"
              options={employees.map((e:any)=>({value:e.unique_hash,label:`${e.name} — ${e.company_full_name}`}))} />
          </Form.Item>
          <Form.Item name="welfare_set" label="福利套" rules={[{ required: true }]}>
            <Select options={welfareSets.map(w=>({value:w,label:w}))} />
          </Form.Item>
          <Space style={{width:'100%'}} size="large">
            <Form.Item name="social_base" label="社保基数"><InputNumber style={{width:200}} min={0} /></Form.Item>
            <Form.Item name="housing_fund_base" label="公积金基数"><InputNumber style={{width:200}} min={0} /></Form.Item>
          </Space>
          {/* 后面福利套配置完善后，这里可以加自动计算按钮 */}
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeeSocial;
