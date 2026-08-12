import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Card, InputNumber } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import api from '../../api/client';

const REGIONS = ['上海', '北京', '天津', '深圳', '南京'];
const ROUND_OPTIONS = [
  { value: 'ROUND', label: '四舍五入' },
  { value: 'ROUNDUP', label: '向上取整' },
  { value: 'ROUND_1DEC', label: '保留1位小数' },
];

const WelfareSetPage: React.FC = () => {
  const [sets, setSets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/welfare_sets?select=*&order=name');
      setSets(res.data.map((s:any)=>({...s,key:s.id})));
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingSet(null);
    form.resetFields();
    form.setFieldsValue({ rounding_method: 'ROUND' });
    setModalOpen(true);
  };

  const openEdit = (s: any) => {
    setEditingSet(s);
    form.setFieldsValue(s);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingSet) {
        await api.patch(`/welfare_sets?id=eq.${editingSet.id}`, values);
        message.success('已更新');
      } else {
        await api.post('/welfare_sets', values);
        message.success('已创建');
      }
      setModalOpen(false);
      loadData();
    } catch { message.error('操作失败'); }
  };

  const columns = [
    { title: '福利套名称', dataIndex: 'name', key: 'name', width: 150 },
    { title: '地区', dataIndex: 'region', key: 'region', width: 80 },
    { title: '个人养老%', dataIndex: 'pension_rate_p', key: 'prp', width: 100, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '个人医疗%', dataIndex: 'medical_rate_p', key: 'mrp', width: 100, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '个人失业%', dataIndex: 'unemployment_rate_p', key: 'urp', width: 100, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '个人公积金%', dataIndex: 'housing_fund_rate_p', key: 'hrp', width: 110, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '补充公积金%', dataIndex: 'supp_housing_rate_p', key: 'shp', width: 110, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '公司养老%', dataIndex: 'pension_rate_c', key: 'prc', width: 100, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '公司医疗%', dataIndex: 'medical_rate_c', key: 'mrc', width: 100, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '公司失业%', dataIndex: 'unemployment_rate_c', key: 'urc', width: 100, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '公司工伤%', dataIndex: 'injury_rate_c', key: 'irc', width: 100, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '公司生育%', dataIndex: 'maternity_rate_c', key: 'mrc2', width: 100, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '公司公积金%', dataIndex: 'housing_fund_rate_c', key: 'hrc', width: 110, render: (v:any)=>v ? `${(v*100).toFixed(1)}%` : '—' },
    { title: '取整方式', dataIndex: 'rounding_method', key: 'rm', width: 100 },
    {
      title: '操作', key: 'act', width: 80, fixed: 'right' as const,
      render: (_:any, r:any) => <Button size="small" onClick={() => openEdit(r)}>编辑</Button>,
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建福利套</Button>
      </Card>

      <Table columns={columns} dataSource={sets} loading={loading} scroll={{ x: 1800 }} size="small" />

      <Modal
        title={editingSet ? '编辑福利套' : '新建福利套'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={800}
        okText="保存" cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Space style={{width:'100%'}} size="large">
            <Form.Item name="name" label="福利套名称" rules={[{required:true}]}><Input /></Form.Item>
            <Form.Item name="region" label="地区" rules={[{required:true}]}>
              <Select options={REGIONS.map(r=>({value:r,label:r}))} />
            </Form.Item>
            <Form.Item name="rounding_method" label="取整方式">
              <Select options={ROUND_OPTIONS} />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="备注"><Input.TextArea rows={2} /></Form.Item>

          <Card title="个人费率" size="small" style={{marginBottom:16}}>
            <Space wrap>
              <Form.Item name="pension_rate_p" label="养老"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="medical_rate_p" label="医疗"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="medical_fixed_p" label="医疗固定附加"><InputNumber min={0} style={{width:120}} /></Form.Item>
              <Form.Item name="unemployment_rate_p" label="失业"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="housing_fund_rate_p" label="公积金"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="supp_housing_rate_p" label="补充公积金"><InputNumber step={0.0001} min={0} max={1} style={{width:130}} /></Form.Item>
            </Space>
          </Card>

          <Card title="公司费率" size="small" style={{marginBottom:16}}>
            <Space wrap>
              <Form.Item name="pension_rate_c" label="养老"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="medical_rate_c" label="医疗"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="unemployment_rate_c" label="失业"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="injury_rate_c" label="工伤"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="maternity_rate_c" label="生育"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="housing_fund_rate_c" label="公积金"><InputNumber step={0.0001} min={0} max={1} style={{width:120}} /></Form.Item>
              <Form.Item name="supp_housing_rate_c" label="补充公积金"><InputNumber step={0.0001} min={0} max={1} style={{width:130}} /></Form.Item>
            </Space>
          </Card>
        </Form>
      </Modal>
    </div>
  );
};

export default WelfareSetPage;
