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
          <Button onClick={testApi}>测试后端连接</Button>
          {apiTestResult && <Typography.Text>{apiTestResult}</Typography.Text>}
        </Space>
      </Card>

      <Card title="计算规则" style={{ marginBottom: 16 }}>
        <Typography.Paragraph>
          <strong>计税模式：</strong>
          <ul>
            <li>正常计税（normal）：七级累进税率 3%-45%，累计预扣法，每月减除费用 5000 元</li>
            <li>劳务报酬（service）：（薪资小计 - 800）× 20%，最低为 0</li>
            <li>不计税（non_taxable）：个税为 0，适用于香港员工</li>
          </ul>
        </Typography.Paragraph>
        <Typography.Paragraph>
          <strong>考勤规则：</strong>
          <ul>
            <li>病假：扣 50% 日薪</li>
            <li>事假：扣 100% 日薪</li>
            <li>年假：不扣款</li>
            <li>加班：补 100% 日薪</li>
            <li>日薪 = 基本工资 ÷ 21.75</li>
          </ul>
        </Typography.Paragraph>
        <Typography.Paragraph>
          <strong>残疾人特殊规则：</strong>代收代付残疾人社保基数固定为 7460 元
        </Typography.Paragraph>
      </Card>

      <Card title="技术信息" style={{ marginBottom: 16 }}>
        <Typography.Paragraph>
          <strong>前端：</strong>React 18 + TypeScript + Ant Design 5<br />
          <strong>后端：</strong>Python FastAPI + SQLAlchemy 2.0<br />
          <strong>数据库：</strong>Supabase (PostgreSQL 15) + RLS<br />
          <strong>部署：</strong>Vercel (前端) + Supabase (后端/数据库)
        </Typography.Paragraph>
      </Card>
    </div>
  );
};

export default SettingsPage;
