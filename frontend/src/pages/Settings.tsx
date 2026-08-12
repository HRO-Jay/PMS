import React, { useState } from 'react';
import { Card, Button, Typography, Space, message } from 'antd';

const SettingsPage: React.FC = () => {
  const [apiTestResult, setApiTestResult] = useState<string>('');

  const testApi = async () => {
    try {
      const { fetchCompanies } = await import('../api/endpoints');
      const res = await fetchCompanies();
      setApiTestResult(`✅ 连接成功 — ${res.data.total} 家公司已加载`);
      message.success('API 连接正常');
    } catch (e: any) {
      setApiTestResult(`❌ 连接失败 — ${e.message}`);
      message.error('API 连接失败');
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Typography.Title level={4}>系统设置</Typography.Title>

      <Card title="API 连接测试" style={{ marginBottom: 16 }}>
        <Space>
          <Button onClick={testApi}>测试连接</Button>
          {apiTestResult && <Typography.Text>{apiTestResult}</Typography.Text>}
        </Space>
      </Card>

      <Card title="部署信息" style={{ marginBottom: 16 }}>
        <Typography.Paragraph>
          <strong>前端：</strong>GitHub Pages（国内可访问）<br />
          <strong>代理：</strong>腾讯云 SCF 云函数（函数 URL 反向代理 Supabase）<br />
          <strong>数据库：</strong>Supabase (PostgreSQL 15)<br />
          <strong>前端框架：</strong>React 18 + TypeScript + Ant Design 5<br />
          <strong>后端：</strong>Python FastAPI + SQLAlchemy 2.0
        </Typography.Paragraph>
      </Card>

      <Card title="计算规则" style={{ marginBottom: 16 }}>
        <Typography.Paragraph>
          <strong>计税模式：</strong>
          正常计税（normal）— 七级累进税率 3%-45%，累计预扣法，每月减除费用 5000 元<br />
          劳务报酬（service）—（薪资小计 - 800）× 20%<br />
          不计税（non_taxable）— 个税为 0，适用于香港员工
        </Typography.Paragraph>
      </Card>
    </div>
  );
};

export default SettingsPage;
