import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tag, Popconfirm, Card } from 'antd';
import { PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { fetchEmployees, createEmployee, updateEmployee, deleteEmployee } from '../api/endpoints';
import { fetchCompanies } from '../api/endpoints';
import { useStore } from '../stores/appStore';
import { taxTypeLabel, socialStatusLabel } from '../utils/format';
import type { Employee } from '../types';

const EmployeesPage: React.FC = () => {
  const { companies, setCompanies } = useStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>();

  useEffect(() => { loadAll(); }, [filterCompany, search]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [compRes, empRes] = await Promise.all([
        fetchCompanies(),
        fetchEmployees({ company_code: filterCompany, search: search || undefined, is_active: true }),
      ]);
      setCompanies(compRes.data.companies);
      setEmployees(empRes.data);
    } catch { message.error('加载数据失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingEmployee(null);
    form.resetFields();
    form.setFieldsValue({ tax_type: 'normal', social_status: '有社保' });
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    form.setFieldsValue(emp);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, values);
        message.success('更新成功');
      } else {
        await createEmployee(values);
        message.success('添加成功');
      }
      setModalOpen(false);
      loadAll();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try { await deleteEmployee(id); message.success('已离职'); loadAll(); }
    catch { message.error('操作失败'); }
  };

  const columns = [
    { title: '工号', dataIndex: 'employee_no', key: 'no', width: 100 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 80 },
    { title: '公司', dataIndex: 'company_full_name', key: 'company', width: 220, ellipsis: true },
    { title: '部门', dataIndex: 'department', key: 'dept', width: 100 },
    { title: '岗位', dataIndex: 'position', key: 'pos', width: 100 },
    { title: '计税模式', dataIndex: 'tax_type', key: 'tax', width: 90, render: (v: string) => <Tag>{taxTypeLabel(v)}</Tag> },
    { title: '社保状态', dataIndex: 'social_status', key: 'ss', width: 90, render: (v: string) => socialStatusLabel(v) },
    { title: '社保基数', dataIndex: 'social_base', key: 'sbase', width: 100, render: (v: any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
    { title: '公积金基数', dataIndex: 'housing_fund_base', key: 'hbase', width: 100, render: (v: any) => v ? `¥${Number(v).toLocaleString()}` : '—' },
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
          <Button icon={<UploadOutlined />}>批量导入</Button>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索姓名/工号"
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
        width={640}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="employee_no" label="员工编号" rules={[{ required: true }]}>
            <Input placeholder="如 EMP001" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="company_code" label="所属公司" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择公司"
              options={companies.map(c => ({ value: c.code, label: c.full_name }))}
            />
          </Form.Item>
          <Form.Item name="company_full_name" label="公司全称" rules={[{ required: true }]}>
            <Input placeholder="与所选公司一致" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="department" label="部门">
              <Input />
            </Form.Item>
            <Form.Item name="position" label="岗位">
              <Input />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="tax_type" label="计税模式" rules={[{ required: true }]}>
              <Select options={[
                { value: 'normal', label: '正常计税（累计预扣）' },
                { value: 'service', label: '劳务报酬（20%）' },
                { value: 'non_taxable', label: '不计税（HK员工）' },
              ]} />
            </Form.Item>
            <Form.Item name="social_status" label="社保状态" rules={[{ required: true }]}>
              <Select options={[
                { value: '有社保', label: '有社保' },
                { value: '无社保', label: '无社保' },
                { value: '残疾人', label: '残疾人（基数7460）' },
              ]} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="social_base" label="社保基数">
              <Input type="number" placeholder="如 12000" />
            </Form.Item>
            <Form.Item name="housing_fund_base" label="公积金基数">
              <Input type="number" placeholder="如 12000" />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="bank_account" label="银行账号">
              <Input placeholder="加密存储" />
            </Form.Item>
            <Form.Item name="id_number" label="身份证号">
              <Input placeholder="加密存储" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeesPage;
