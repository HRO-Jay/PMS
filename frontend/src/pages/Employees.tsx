import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tag, Popconfirm, Card, DatePicker } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { fetchEmployees, createEmployee, updateEmployee, deleteEmployee } from '../api/endpoints';
import { fetchCompanies } from '../api/endpoints';
import type { Employee } from '../types';
import dayjs from 'dayjs';

const WORK_SCHEDULES = ['全日制', '非全日制', '不定时工作制'];
const TAX_TYPES = [
  { value: 'normal', label: '正常计税（累计预扣）' },
  { value: 'service', label: '劳务报酬（20%）' },
  { value: 'non_taxable', label: '不计税（HK员工）' },
];

const EmployeesPage: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<{code:string; full_name:string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>();

  useEffect(() => { loadData(); }, [filterCompany, search]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [compRes] = await Promise.all([fetchCompanies()]);
      setCompanies(compRes.data.companies);
      const empRes = await fetchEmployees({ company_code: filterCompany, search: search || undefined, is_active: true });
      setEmployees(empRes.data);
    } catch { message.error('加载数据失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingEmployee(null);
    form.resetFields();
    form.setFieldsValue({ tax_type: 'normal', work_schedule: '全日制' });
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    const { join_date, ...rest } = emp as any;
    form.setFieldsValue({ ...rest, join_date: join_date ? dayjs(join_date) : undefined });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      join_date: values.join_date ? values.join_date.format('YYYY-MM-DD') : undefined,
    };
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, payload);
        message.success('更新成功');
      } else {
        await createEmployee(payload);
        message.success('添加成功');
      }
      setModalOpen(false);
      loadData();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try { await deleteEmployee(id); message.success('已离职'); loadData(); }
    catch { message.error('操作失败'); }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 80 },
    { title: '发薪公司', dataIndex: 'company_full_name', key: 'company', width: 220, ellipsis: true },
    { title: '成本中心', dataIndex: 'cost_center', key: 'cc', width: 100 },
    { title: '部门', dataIndex: 'department', key: 'dept', width: 100 },
    { title: '汇报人', dataIndex: 'reporter', key: 'rpt', width: 80 },
    { title: '职位', dataIndex: 'position', key: 'pos', width: 120 },
    { title: '入职日期', dataIndex: 'join_date', key: 'jd', width: 100 },
    { title: '考勤制', dataIndex: 'work_schedule', key: 'ws', width: 110, render: (v:string)=><Tag>{v}</Tag> },
    { title: '计税方式', dataIndex: 'tax_type', key: 'tax', width: 100,
      render: (v:string) => <Tag color={v==='normal'?'blue':v==='service'?'orange':'green'}>{TAX_TYPES.find(t=>t.value===v)?.label||v}</Tag> },
    {
      title: '操作', key: 'actions', width: 140, fixed: 'right' as const,
      render: (_: any, r: Employee) => (
        <Space>
          <Button size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认将此员工设为离职？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger>离职</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加员工</Button>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索姓名"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="按公司筛选"
            value={filterCompany}
            onChange={setFilterCompany}
            allowClear
            style={{ width: 280 }}
            showSearch
            optionFilterProp="label"
            options={companies.map(c => ({ value: c.code, label: c.full_name }))}
          />
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={employees.map(e => ({ ...e, key: e.id }))}
        loading={loading}
        scroll={{ x: 1200 }}
        size="small"
        pagination={{ pageSize: 50, showTotal: t => `共 ${t} 人` }}
      />

      <Modal
        title={editingEmployee ? '编辑员工' : '添加员工'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={700}
        okText="保存" cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="company_code" label="发薪公司" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择公司"
              options={companies.map(c => ({ value: c.code, label: c.full_name }))} />
          </Form.Item>
          <Form.Item name="company_full_name" label="公司全称" rules={[{ required: true }]}>
            <Input placeholder="与所选公司一致" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="cost_center" label="成本中心"><Input /></Form.Item>
            <Form.Item name="department" label="部门"><Input /></Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="reporter" label="汇报人"><Input /></Form.Item>
            <Form.Item name="position" label="职位"><Input /></Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="join_date" label="入职日期"><DatePicker style={{width:'100%'}} /></Form.Item>
            <Form.Item name="work_schedule" label="考勤制" rules={[{ required: true }]}>
              <Select options={WORK_SCHEDULES.map(s => ({ value: s, label: s }))} />
            </Form.Item>
          </Space>
          <Form.Item name="tax_type" label="计税方式" rules={[{ required: true }]}>
            <Select options={TAX_TYPES} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeesPage;
