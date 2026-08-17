import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, message, Descriptions, Button } from 'antd';
import api from '../../api/client';

/**
 * 考勤规则配置页面
 * 展示当前生效的计算规则（病假系数、计薪天数、加班倍数、假期规则）
 * 规则数据来源：attendance_rules 表（若有）或系统默认值
 */

const AttendanceRulesPage: React.FC = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance_rules?select=*&order=rule_type');
      setRules(res.data.map((r: any) => ({ ...r, key: r.id })));
    } catch { message.error('加载规则失败'); }
    finally { setLoading(false); }
  };

  const columns = [
    { title: '规则类型', dataIndex: 'rule_type', key: 'type', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: '规则标识', dataIndex: 'rule_key', key: 'key', width: 130 },
    { title: '规则名称', dataIndex: 'rule_name', key: 'name', width: 180 },
    { title: '生效月份', dataIndex: 'effective_month', key: 'em', width: 100, render: (v: string) => v || '—' },
    { title: '失效月份', dataIndex: 'expiry_month', key: 'xm', width: 100, render: (v: string) => v || '—' },
    {
      title: '规则内容', dataIndex: 'rule_value', key: 'value',
      render: (v: any) => {
        try {
          const obj = typeof v === 'string' ? JSON.parse(v) : v;
          return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(obj, null, 2)}</pre>;
        } catch {
          return String(v);
        }
      },
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Descriptions column={3} size="small">
          <Descriptions.Item label="病假规则">
            连续病假6个月内：工龄&lt;2年60%、2-4年70%、4-6年80%、6-8年90%、8年以上100%
          </Descriptions.Item>
          <Descriptions.Item label="疾病救济费">
            连续病假超6个月：工龄&lt;1年40%、1-3年50%、3年以上60%
          </Descriptions.Item>
          <Descriptions.Item label="计薪天数">
            双休21.75天、单休26天、全年无休30天
          </Descriptions.Item>
          <Descriptions.Item label="加班倍数">
            平时1倍、周末2倍、法定节假日3倍
          </Descriptions.Item>
          <Descriptions.Item label="保洁特殊规则">
            职位为"保洁"时，法定节假日加班按天数×固定金额
          </Descriptions.Item>
          <Descriptions.Item label="年假/调休">
            年假不参与金额计算，调休系数为0，均不产生扣款
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="规则明细（数据库）" size="small">
        <Table columns={columns} dataSource={rules} loading={loading} size="small" pagination={false} />
      </Card>
    </div>
  );
};

export default AttendanceRulesPage;
