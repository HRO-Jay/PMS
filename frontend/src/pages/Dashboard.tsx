import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Statistic, Space, Input, message, Table, Tabs, Tag, Badge, Button, Modal } from 'antd';
import { TeamOutlined, DollarOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import api from '../api/client';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const COST_ORDER = ['实收工资', '公司福利合计', '绩效&佣金合计', '预提福利费', '商保金额', '考勤调整'];

const Dashboard: React.FC = () => {
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);
  const [summaryTab, setSummaryTab] = useState<'dept' | 'company'>('company');
  const [stats, setStats] = useState<any>(null);
  const [summaryRows, setSummaryRows] = useState<any[]>([]);
  const [rosterChanges, setRosterChanges] = useState<{ additions: any[]; removals: any[]; prevActiveCount?: number }>({ additions: [], removals: [] });
  const [costComposition, setCostComposition] = useState<any[]>([]);
  const [costDetail, setCostDetail] = useState<Record<string, any[]>>({});
  const [expandAdd, setExpandAdd] = useState(false);
  const [expandRemove, setExpandRemove] = useState(false);
  const [drillDown, setDrillDown] = useState<{ name: string; items: any[] } | null>(null);
  const chartRef = React.useRef<HTMLDivElement>(null);
  const chartInstanceRef = React.useRef<echarts.ECharts | null>(null);

  useEffect(() => { loadData(); }, [period, summaryTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 员工
      const empRes = await api.get('/employees?select=unique_hash,name,status,pay_company,cost_center,department,entry_date,leave_date');
      const empList: any[] = empRes.data;
      const activeEmps = empList.filter((e: any) => e.status === '在职');
      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });

      // 薪资
      const salRes = await api.get(`/salary_records?select=*&period=eq.${period}`);
      const salList: any[] = salRes.data;
      const salMap: Record<string, any> = {};
      salList.forEach((r: any) => { salMap[r.unique_hash] = r; });

      // 附加薪酬
      const addRes = await api.get(`/additional_salary_records?select=*&period=eq.${period}`);
      const addMap: Record<string, any> = {};
      addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });

      // 社保
      const welfareRes = await api.get(`/employee_welfare_records?select=unique_hash,personal_total,company_total&period=eq.${period}`);
      const welfareMap: Record<string, any> = {};
      welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });

      // 考勤
      const attRes = await api.get(`/attendance_records?select=unique_hash,attendance_adjust_total&period=eq.${period}`);
      const attMap: Record<string, any> = {};
      attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });

      // ===== 汇总统计 =====
      const totalNetPay = salList.reduce((s: number, r: any) => s + (r.net_pay || 0), 0);
      const totalCost = salList.reduce((s: number, r: any) => s + (r.total_cost || 0), 0);
      setStats({ employee_count: activeEmps.length, total_net_pay: totalNetPay, total_cost: totalCost });

      // ===== 明细数据（供下钻） =====
      const detailMap: Record<string, any[]> = {
        '实收工资': [], '公司福利合计': [], '绩效&佣金合计': [], '预提福利费': [], '商保金额': [], '考勤调整': [],
      };
      salList.forEach((r: any) => {
        const emp = empMap[r.unique_hash];
        if (!emp) return;
        const name = emp.name;
        const add = addMap[r.unique_hash] || {};
        const perfComm = (add.office_comm||0)+(add.performance_pay||0)+(add.apartment_comm||0)+(add.talent_kpi||0)+(add.heat_allowance||0)+(add.other_allowance||0)+(add.security_bonus||0)+(add.cleaning_bonus||0);
        detailMap['实收工资'].push({ name, value: r.net_pay || 0 });
        detailMap['公司福利合计'].push({ name, value: welfareMap[r.unique_hash]?.company_total || 0 });
        detailMap['绩效&佣金合计'].push({ name, value: perfComm });
        detailMap['预提福利费'].push({ name, value: r.provision_welfare || 0 });
        detailMap['商保金额'].push({ name, value: add.insurance_amount || 0 });
        detailMap['考勤调整'].push({ name, value: attMap[r.unique_hash]?.attendance_adjust_total || 0 });
      });
      setCostDetail(detailMap);

      // ===== Summary 汇总 =====
      const buildSummary = (groupKey: 'cost_center' | 'pay_company') => {
        const byGroup: Record<string, any> = {};
        activeEmps.forEach((e: any) => {
          const g = e[groupKey] || '未知';
          if (!byGroup[g]) byGroup[g] = { group: g, count: 0, net: 0, company_welfare: 0, personal_welfare: 0, perf_comm: 0, attendance_adjust: 0, insurance: 0, provision: 0, total_cost: 0 };
          byGroup[g].count++;
        });
        salList.forEach((r: any) => {
          const emp = empMap[r.unique_hash];
          if (!emp) return;
          const g = emp[groupKey] || '未知';
          if (!byGroup[g]) byGroup[g] = { group: g, count: 0, net: 0, company_welfare: 0, personal_welfare: 0, perf_comm: 0, attendance_adjust: 0, insurance: 0, provision: 0, total_cost: 0 };
          const add = addMap[r.unique_hash] || {};
          const perfComm = (add.office_comm||0)+(add.performance_pay||0)+(add.apartment_comm||0)+(add.talent_kpi||0)+(add.heat_allowance||0)+(add.other_allowance||0)+(add.security_bonus||0)+(add.cleaning_bonus||0);
          byGroup[g].net += r.net_pay || 0;
          byGroup[g].company_welfare += welfareMap[r.unique_hash]?.company_total || 0;
          byGroup[g].personal_welfare += welfareMap[r.unique_hash]?.personal_total || 0;
          byGroup[g].perf_comm += perfComm;
          byGroup[g].attendance_adjust += attMap[r.unique_hash]?.attendance_adjust_total || 0;
          byGroup[g].insurance += add.insurance_amount || 0;
          byGroup[g].provision += r.provision_welfare || 0;
          byGroup[g].total_cost += r.total_cost || 0;
        });
        return Object.values(byGroup).map((g: any) => ({ ...g, key: g.group }));
      };
      setSummaryRows(buildSummary(summaryTab === 'company' ? 'pay_company' : 'cost_center'));

      // ===== 花名册变动分析 =====
      const additions = activeEmps.filter((e: any) => e.entry_date && e.entry_date.startsWith(period)).map((e: any) => ({ key: e.unique_hash, name: e.name, department: e.department || '', date: e.entry_date, cost_center: e.cost_center || '' }));
      const removals = empList.filter((e: any) => e.leave_date && e.leave_date.startsWith(period)).map((e: any) => ({ key: e.unique_hash, name: e.name, department: e.department || '', date: e.leave_date, cost_center: e.cost_center || '' }));
      // 上月在职 = 本月在职 - 本月新增 + 本月离职
      const prevActiveCount = activeEmps.length - additions.length + removals.length;
      setRosterChanges({ additions, removals, prevActiveCount });

      // ===== 成本构成占比 =====
      const comp = [
        { name: '实收工资', value: totalNetPay },
        { name: '公司福利合计', value: salList.reduce((s, r) => s + (welfareMap[r.unique_hash]?.company_total || 0), 0) },
        { name: '绩效&佣金合计', value: salList.reduce((s, r) => { const a = addMap[r.unique_hash] || {}; return s + (a.office_comm||0)+(a.performance_pay||0)+(a.apartment_comm||0)+(a.talent_kpi||0)+(a.heat_allowance||0)+(a.other_allowance||0)+(a.security_bonus||0)+(a.cleaning_bonus||0); }, 0) },
        { name: '预提福利费', value: salList.reduce((s, r) => s + (r.provision_welfare || 0), 0) },
        { name: '商保金额', value: salList.reduce((s, r) => s + ((addMap[r.unique_hash]||{}).insurance_amount || 0), 0) },
        { name: '考勤调整', value: salList.reduce((s, r) => s + (attMap[r.unique_hash]?.attendance_adjust_total || 0), 0) },
      ];
      const sorted = comp.every(c => c.value === 0)
        ? COST_ORDER.map(n => comp.find(c => c.name === n)!)
        : [...comp].sort((a, b) => b.value - a.value);
      setCostComposition(sorted);
    } catch { message.error('加载数据总览失败'); }
    finally { setLoading(false); }
  };

  // 渲染环形图
  useEffect(() => {
    if (!chartRef.current || costComposition.length === 0) return;
    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;
    const total = costComposition.reduce((s, c) => s + c.value, 0);
    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { scale: true, scaleSize: 5 },
        data: total === 0
          ? costComposition.map((c) => ({ name: c.name, value: 1, itemStyle: { color: '#e0e0e0' } }))
          : costComposition.map(c => ({ name: c.name, value: c.value })),
      }],
    };
    chart.setOption(option);
    return () => { chart.dispose(); chartInstanceRef.current = null; };
  }, [costComposition]);

  const maxComposition = useMemo(() => Math.max(...costComposition.map(c => c.value), 1), [costComposition]);

  // 图例悬停联动
  const handleLegendHover = (idx: number, hover: boolean) => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    if (hover) {
      chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
    } else {
      chart.dispatchAction({ type: 'downplay', seriesIndex: 0, dataIndex: idx });
    }
  };

  // 图例点击下钻
  const handleLegendClick = (name: string) => {
    const items = (costDetail[name] || []).filter(i => i.value !== 0);
    setDrillDown({ name, items });
  };

  const summaryColumns = [
    { title: summaryTab === 'company' ? '发薪公司' : '成本中心', dataIndex: 'group', key: 'group', fixed: 'left' as const, width: 150, ellipsis: true },
    { title: '人数', dataIndex: 'count', key: 'count', width: 70 },
    { title: '实收工资', dataIndex: 'net', key: 'net', width: 120, render: (v: number) => fmtMoney(v) },
    { title: '公司福利', dataIndex: 'company_welfare', key: 'cw', width: 110, render: (v: number) => fmtMoney(v) },
    { title: '个人福利', dataIndex: 'personal_welfare', key: 'pw', width: 110, render: (v: number) => fmtMoney(v) },
    { title: '绩效&佣金', dataIndex: 'perf_comm', key: 'pc', width: 110, render: (v: number) => fmtMoney(v) },
    { title: '考勤调整', dataIndex: 'attendance_adjust', key: 'aa', width: 100, render: (v: number) => fmtMoney(v) },
    { title: '商保金额', dataIndex: 'insurance', key: 'ins', width: 100, render: (v: number) => fmtMoney(v) },
    { title: '预提福利费', dataIndex: 'provision', key: 'prov', width: 110, render: (v: number) => fmtMoney(v) },
    { title: '人力成本总计', dataIndex: 'total_cost', key: 'tc', fixed: 'right' as const, width: 130, render: (v: number) => <strong>{fmtMoney(v)}</strong> },
  ];

  const changeColumns = (dateLabel: string) => [
    { title: '姓名', dataIndex: 'name', width: 80 },
    { title: '部门', dataIndex: 'department', width: 100 },
    { title: '成本中心', dataIndex: 'cost_center', width: 110 },
    { title: dateLabel, dataIndex: 'date', width: 100 },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <span>月份：</span>
        <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 200 }} />
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card><Statistic title="在职员工" value={stats?.employee_count || 0} prefix={<TeamOutlined />} /></Card></Col>
        <Col span={8}><Card><Statistic title="当月实发总额" value={stats?.total_net_pay || undefined} precision={2} prefix="¥" /></Card></Col>
        <Col span={8}><Card><Statistic title="当月人力成本" value={stats?.total_cost || undefined} precision={2} prefix="¥" /></Card></Col>
      </Row>

      {/* 花名册变动分析 */}
      <Card title="花名册变动分析" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge count={rosterChanges.additions.length} style={{ backgroundColor: '#27ae60' }} showZero />
              <span style={{ color: '#27ae60', fontWeight: 600, fontSize: 15 }}>新增</span>
              <Tag color="green">上月 {rosterChanges.prevActiveCount ?? '—'} 人</Tag>
            </div>
            <Table
              size="small"
              pagination={false}
              dataSource={expandAdd ? rosterChanges.additions : rosterChanges.additions.slice(0, 5)}
              columns={changeColumns('入职日期')}
            />
            {rosterChanges.additions.length > 5 && (
              <Button type="link" size="small" onClick={() => setExpandAdd(!expandAdd)}>
                {expandAdd ? '收起' : `展开全部（${rosterChanges.additions.length} 人）`}
              </Button>
            )}
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge count={rosterChanges.removals.length} style={{ backgroundColor: '#e74c3c' }} showZero />
              <span style={{ color: '#e74c3c', fontWeight: 600, fontSize: 15 }}>减少</span>
              <Tag color="red">上月 {rosterChanges.prevActiveCount ?? '—'} 人</Tag>
            </div>
            <Table
              size="small"
              pagination={false}
              dataSource={expandRemove ? rosterChanges.removals : rosterChanges.removals.slice(0, 5)}
              columns={changeColumns('离职日期')}
            />
            {rosterChanges.removals.length > 5 && (
              <Button type="link" size="small" onClick={() => setExpandRemove(!expandRemove)}>
                {expandRemove ? '收起' : `展开全部（${rosterChanges.removals.length} 人）`}
              </Button>
            )}
          </Col>
        </Row>
      </Card>

      {/* 数据统计 Summary */}
      <Card size="small" style={{ marginBottom: 16 }} title="数据统计 Summary">
        <Tabs
          activeKey={summaryTab}
          onChange={(k) => { setSummaryTab(k as 'dept' | 'company'); }}
          items={[
            { key: 'company', label: '按公司' },
            { key: 'dept', label: '按部门' },
          ]}
        />
        <div style={{ overflowX: 'auto' }}>
          <Table
            columns={summaryColumns}
            dataSource={summaryRows}
            loading={loading}
            size="small"
            pagination={false}
            scroll={{ x: 1300 }}
          />
        </div>
      </Card>

      {/* 成本构成占比 */}
      <Card size="small" title="成本构成占比">
        <Row gutter={16} align="middle">
          <Col span={12}>
            <div ref={chartRef} style={{ width: '100%', height: 320 }} />
          </Col>
          <Col span={12}>
            {costComposition.map((c, idx) => {
              const pct = maxComposition > 0 ? Math.round((c.value / maxComposition) * 100) : 0;
              return (
                <div
                  key={c.name}
                  style={{ marginBottom: 16, cursor: 'pointer' }}
                  onMouseEnter={() => handleLegendHover(idx, true)}
                  onMouseLeave={() => handleLegendHover(idx, false)}
                  onClick={() => handleLegendClick(c.name)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>{c.name}</span>
                    <span>{fmtMoney(c.value)}</span>
                  </div>
                  <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4 }}>
                    <div style={{ height: 8, width: `${pct}%`, background: '#1677ff', borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </Col>
        </Row>
      </Card>

      {/* 下钻明细弹窗 */}
      <Modal
        title={`${drillDown?.name || ''} 明细`}
        open={!!drillDown}
        onCancel={() => setDrillDown(null)}
        footer={null}
        width={600}
      >
        <Table
          size="small"
          pagination={{ pageSize: 20 }}
          dataSource={drillDown?.items.map((i, idx) => ({ ...i, key: idx })) || []}
          columns={[
            { title: '姓名', dataIndex: 'name' },
            { title: '金额', dataIndex: 'value', render: (v: number) => fmtMoney(v) },
          ]}
        />
      </Modal>
    </div>
  );
};

export default Dashboard;
