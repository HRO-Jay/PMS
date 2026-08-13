import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tag, Popconfirm, Card, DatePicker, Upload } from 'antd';
import { PlusOutlined, SearchOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { fetchEmployees, createEmployee, updateEmployee, deleteEmployee } from '../api/endpoints';
import { fetchCompanies } from '../api/endpoints';
import type { Employee } from '../types';
import dayjs from 'dayjs';
import { exportXlsx, importXlsx, type ExportDef } from '../utils/importExport';
import { genUniqueHash } from '../utils/hash';
import api from '../api/client';

const WORK_SCHEDULES = ['全日制', '非全日制', '不定时工作制'];
const TAX_TYPES = [
  { value: 'normal', label: '正常计税（累计预扣）' },
  { value: 'service', label: '劳务报酬（20%）' },
  { value: 'non_taxable', label: '不计税（HK员工）' },
];

// 计税方式中文 → 枚举 转换
const TAX_LABEL_TO_VALUE: Record<string, string> = {
  '正常计税': 'normal', '累计预扣': 'normal', 'normal': 'normal',
  '劳务计税': 'service', '劳务报酬': 'service', 'service': 'service',
  '国内不计税': 'non_taxable', '不计税': 'non_taxable', 'non_taxable': 'non_taxable',
};

// 考勤制中文 → 标准值
const SCHEDULE_ALIAS: Record<string, string> = {
  '全日制': '全日制', '非全日制': '非全日制', '不定时工作制': '不定时工作制',
};

// 表头定义
const EXPORT_DEF: ExportDef = {
  module: '员工花名册',
  columns: [
    { key: 'name', label: '姓名', required: true },
    { key: 'company_full_name', label: '发薪公司', required: true },
    { key: 'cost_center', label: '成本中心' },
    { key: 'department', label: '部门' },
    { key: 'reporter', label: '汇报人' },
    { key: 'position', label: '职位' },
    { key: 'join_date', label: '入职日期' },
    { key: 'work_schedule', label: '考勤制', required: true },
    { key: 'tax_type', label: '计税方式', required: true },
    { key: 'unique_hash', label: '唯一值', hidden: true },
  ],
};

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
    // company_code 字段此时存的是全称（下拉 value 设为 full_name）
    const fullName = values.company_code;
    const company = companies.find((c: any) => c.full_name === fullName);
    const joinDateStr = values.join_date ? values.join_date.format('YYYY-MM-DD') : '';
    // 自动生成唯一值（姓名 + 公司全称 + 入职日期）
    const unique_hash = await genUniqueHash(values.name, fullName, joinDateStr);
    const payload = {
      ...values,
      company_code: company?.code || '',
      company_full_name: fullName,
      join_date: joinDateStr || undefined,
      unique_hash,
    };
    try {
      if (editingEmployee) {
        // 入职日期不可修改（唯一值绑定）
        const originalJoin = editingEmployee.join_date
          ? String(editingEmployee.join_date).slice(0, 10)
          : '';
        if (originalJoin && joinDateStr && originalJoin !== joinDateStr) {
          message.error('入职日期不可修改（会影响关联数据）');
          return;
        }
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

  // 导出
  const handleExport = () => exportXlsx(EXPORT_DEF, employees);

  // 导入
  const handleImport = async (file: File) => {
    try {
      const { data, import_errors } = await importXlsx(EXPORT_DEF, file);
      if (import_errors.length > 0) {
        message.warning(`有 ${import_errors.length} 行数据存在问题，已跳过`);
      }
      if (data.length === 0) {
        message.info('未找到有效数据');
        return;
      }
      // 公司列表（含简称），用于简称转全称
      const companiesRes = await fetchCompanies();
      const companyList: any[] = companiesRes.data.companies;

      let success = 0;
      let failed = 0;
      const failedReasons: string[] = [];

      for (const row of data) {
        try {
          // 1. 发薪公司：简称 → 全称（精确 → 前缀/包含 模糊匹配）
          const rawCompany = String(row.company_full_name || '').trim();
          let matched = companyList.find((c: any) => c.full_name === rawCompany);
          if (!matched) {
            matched = companyList.find((c: any) => c.short_name === rawCompany);
          }
          if (!matched) {
            // 模糊匹配：简称包含在输入里，或输入包含简称
            matched = companyList.find((c: any) =>
              c.short_name && (rawCompany.includes(c.short_name) || c.short_name.includes(rawCompany))
            );
          }
          if (!matched) {
            // 再兜底：全称包含输入 或 输入包含全称
            matched = companyList.find((c: any) =>
              rawCompany.includes(c.full_name) || c.full_name.includes(rawCompany)
            );
          }
          if (!matched) {
            failed++;
            failedReasons.push(`${row.name || '?'}（公司「${rawCompany}」无法识别）`);
            continue;
          }

          // 2. 计税方式：中文 → 枚举
          const rawTax = String(row.tax_type || '正常计税').trim();
          const taxType = TAX_LABEL_TO_VALUE[rawTax] || 'normal';

          // 3. 考勤制：中文 → 标准值
          const rawSchedule = String(row.work_schedule || '').trim();
          const workSchedule = SCHEDULE_ALIAS[rawSchedule] || '全日制';

          // 4. 自动生成唯一值（姓名 + 公司全称 + 入职日期）
          const joinDateStr = row.join_date ? String(row.join_date).slice(0, 10) : '';
          const unique_hash = await genUniqueHash(row.name, matched.full_name, joinDateStr);

          // 5. 入库（已存在则更新）
          const existing = await api.get(`/employees?unique_hash=eq.${unique_hash}`);
          const empPayload = {
            name: row.name,
            company_code: matched.code,
            company_full_name: matched.full_name,
            cost_center: row.cost_center,
            department: row.department,
            reporter: row.reporter,
            position: row.position,
            join_date: row.join_date ? String(row.join_date).slice(0, 10) : undefined,
            work_schedule: workSchedule,
            tax_type: taxType,
            unique_hash,
            is_active: true,
          };
          if (existing.data.length > 0) {
            await updateEmployee(existing.data[0].id, empPayload);
          } else {
            await createEmployee(empPayload);
          }
          success++;
        } catch {
          failed++;
        }
      }
      if (failed > 0) {
        message.warning(`导入完成：成功 ${success} 条，失败 ${failed} 条。${failedReasons.slice(0, 5).join('；')}`);
      } else {
        message.success(`导入完成：${success} / ${data.length} 条`);
      }
      loadData();
    } catch (e: any) {
      message.error(e.message || '导入失败');
    }
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
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { handleImport(file); return false; }}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
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
              options={companies.map(c => ({ value: c.full_name, label: c.full_name }))} />
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
            <Form.Item name="join_date" label="入职日期" extra={editingEmployee?.join_date ? '入职日期不可修改' : undefined}>
              <DatePicker style={{ width: '100%' }} disabled={!!editingEmployee?.join_date} />
            </Form.Item>
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
