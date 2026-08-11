import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Space, message } from 'antd';
import { fetchCompanies, fetchSocialPolicies } from '../api/endpoints';
import { formatPercent } from '../utils/format';
import type { SocialPolicy } from '../types';

const regionColors: Record<string, string> = {
  '上海标准': 'blue', '北京标准': 'red', '天津标准': 'orange',
  '深圳标准': 'green', '南京标准': 'purple', '不计税': 'default', '无社保': 'default',
};

const CompaniesPage: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [policies, setPolicies] = useState<SocialPolicy[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [compRes, polRes] = await Promise.all([
        fetchCompanies(),
        fetchSocialPolicies(),
      ]);
      setCompanies(compRes.data.companies);
      setPolicies(polRes.data.policies);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  const columns = [
    {
      title: '公司全称', dataIndex: 'full_name', key: 'name', width: 320, ellipsis: true,
      render: (v: string) => <strong>{v}</strong>,
    },
    { title: '地区', dataIndex: 'region', key: 'region', width: 60, render: (v: string) => <Tag>{v}</Tag> },
    { title: '分类', dataIndex: 'category', key: 'cat', width: 80 },
    {
      title: '社保策略', dataIndex: 'social_policy', key: 'policy', width: 100,
      render: (v: string) => <Tag color={regionColors[v] || 'default'}>{v}</Tag>,
    },
    { title: '财务对接', dataIndex: 'finance_contact', key: 'fin', width: 80, render: (v: string) => v || '—' },
    { title: '用印人', dataIndex: 'seal_person', key: 'seal', width: 120, render: (v: string) => v || '—' },
  ];

  // 统计
  const stats = {
    total: companies.length,
    shanghai: companies.filter(c => c.region === '上海').length,
    beijing: companies.filter(c => c.region === '北京').length,
    tianjin: companies.filter(c => c.region === '天津').length,
    shenzhen: companies.filter(c => c.region === '深圳').length,
    nanjing: companies.filter(c => c.region === '南京').length,
    hongkong: companies.filter(c => c.region === '香港').length,
  };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="large">
          <span>总计：<strong>{stats.total} 家</strong></span>
          <Tag color="blue">上海：{stats.shanghai}</Tag>
          <Tag color="red">北京：{stats.beijing}</Tag>
          <Tag color="orange">天津：{stats.tianjin}</Tag>
          <Tag color="green">深圳：{stats.shenzhen}</Tag>
          <Tag color="purple">南京：{stats.nanjing}</Tag>
          <Tag color="cyan">香港：{stats.hongkong}</Tag>
        </Space>
      </Card>

      <Card title="公司列表" style={{ marginBottom: 16 }}>
        <Table columns={columns}
          dataSource={companies.map(c => ({ ...c, key: c.code }))}
          loading={loading} size="small"
          pagination={false} />
      </Card>

      <Card title="社保费率配置（2026）">
        <Table
          dataSource={policies.map(p => ({
            ...p, key: p.id, company_name: companies.find(c => c.code === p.company_code)?.full_name || p.company_code,
          }))}
          columns={[
            { title: '公司', dataIndex: 'company_name', key: 'cn', width: 280, ellipsis: true },
            { title: '生效日', dataIndex: 'effective_date', key: 'ed', width: 100 },
            { title: '养老(个/公)', key: 'pen', width: 110, render: (_: any, r: any) => `${formatPercent(r.pension_rate_p)} / ${formatPercent(r.pension_rate_c)}` },
            { title: '医疗(个/公)', key: 'med', width: 110, render: (_: any, r: any) => `${formatPercent(r.medical_rate_p)} / ${formatPercent(r.medical_rate_c)}` },
            { title: '失业(个/公)', key: 'une', width: 110, render: (_: any, r: any) => `${formatPercent(r.unemployment_rate_p)} / ${formatPercent(r.unemployment_rate_c)}` },
            { title: '工伤(公)', key: 'inj', width: 80, render: (_: any, r: any) => formatPercent(r.injury_rate_c) },
            { title: '生育(公)', key: 'mat', width: 80, render: (_: any, r: any) => formatPercent(r.maternity_rate_c) },
            { title: '公积金(个/公)', key: 'hsg', width: 120, render: (_: any, r: any) => `${formatPercent(r.housing_fund_rate_p)} / ${formatPercent(r.housing_fund_rate_c)}` },
            { title: '取整', dataIndex: 'rounding_method', key: 'rnd', width: 90, render: (v: string) => <Tag>{v}</Tag> },
          ]}
          size="small"
          scroll={{ x: 1200 }}
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default CompaniesPage;
