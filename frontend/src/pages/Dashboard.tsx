import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Statistic, Space, Input, message, Table, Tabs, Tag, Badge, Button, Segmented } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import api from '../api/client';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const BRAND = '#1677ff';      // 品牌主色
const ORANGE = '#fa8c16';     // 高亮橙（绩效）
const NEUTRAL = '#8c8c8c';    // 中性灰（津贴）
const WARNING = '#e74c3c';    // 警示红（加班）
const LIGHT_GRAY = '#d9d9d9';
const PLACEHOLDER = '#f0f0f0';

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtMoneyInt = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '¥0';
  return `¥${Math.round(Number(v)).toLocaleString('zh-CN')}`;
};

/** 中位数 */
function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 取整到"好看"的步长 */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let nice = 1;
  if (norm > 1) nice = 2;
  if (norm > 2) nice = 5;
  if (norm > 5) nice = 10;
  return nice * mag;
}

/** 动态等宽分箱（5-7 个区间） */
function buildBins(values: number[]): { label: string; count: number; pct: number }[] {
  const v = values.filter(x => Number(x) > 0);
  if (!v.length) return [];
  const min = Math.min(...v);
  const max = Math.max(...v);
  if (min === max) {
    return [{ label: `¥${Math.round(min).toLocaleString('zh-CN')}`, count: v.length, pct: 100 }];
  }
  const target = 6;
  const step = niceStep((max - min) / target);
  const start = Math.floor(min / step) * step;
  const bins: { lo: number; hi: number; count: number }[] = [];
  let lo = start;
  while (lo < max) {
    bins.push({ lo, hi: lo + step, count: 0 });
    lo += step;
  }
  v.forEach(x => {
    const idx = Math.min(Math.floor((x - start) / step), bins.length - 1);
    if (idx >= 0) bins[idx].count++;
  });
  const total = v.length;
  return bins.map((b, i) => {
    const loFmt = `¥${Math.round(b.lo).toLocaleString('zh-CN')}`;
    const hiFmt = `¥${Math.round(b.hi).toLocaleString('zh-CN')}`;
    let label: string;
    if (i === 0) label = `${loFmt}以下`;
    else if (i === bins.length - 1) label = `${loFmt}以上`;
    else label = `${loFmt} - ${hiFmt}`;
    return { label, count: b.count, pct: Math.round((b.count / total) * 100) };
  });
}

/** 拼音/字母升序排序（人数相同用） */
const zhCompare = (a: string, b: string) => a.localeCompare(b, 'zh-Hans-CN');

const Dashboard: React.FC = () => {
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);
  const [summaryTab, setSummaryTab] = useState<'dept' | 'company'>('company');
  const [stats, setStats] = useState<any>(null);
  const [summaryRows, setSummaryRows] = useState<any[]>([]);
  const [rosterChanges, setRosterChanges] = useState<{ additions: any[]; removals: any[]; prevActiveCount?: number }>({ additions: [], removals: [] });
  const [expandAdd, setExpandAdd] = useState(false);
  const [expandRemove, setExpandRemove] = useState(false);

  // 图表1：人数分布
  const [headcountView, setHeadcountView] = useState<'dept' | 'cost'>('dept');
  const [headcountData, setHeadcountData] = useState<{ dept: any[]; cost: any[] }>({ dept: [], cost: [] });
  // 图表2：平均实发
  const [avgPayList, setAvgPayList] = useState<any[]>([]);
  const [companyAvgNet, setCompanyAvgNet] = useState(0);
  // 图表3：薪资区间
  const [salaryDist, setSalaryDist] = useState<{ label: string; count: number; pct: number }[]>([]);
  const [salaryMedian, setSalaryMedian] = useState(0);
  // 图表4：工资构成
  const [composition, setComposition] = useState<any[]>([]);
  const [selectedDonut, setSelectedDonut] = useState(-1);
  const [donutHover, setDonutHover] = useState<number | null>(null);

  const headcountRef = React.useRef<HTMLDivElement>(null);
  const avgRef = React.useRef<HTMLDivElement>(null);
  const histRef = React.useRef<HTMLDivElement>(null);
  const donutRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, [period, summaryTab]);

  function prevPeriod(p: string): string {
    const [y, m] = p.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }

  const loadData = async () => {
    setLoading(true);
    try {
      const prev = prevPeriod(period);
      // 员工
      const empRes = await api.get('/employees?select=unique_hash,name,status,pay_company,cost_center,department,entry_date,leave_date,basic_salary');
      const empList: any[] = empRes.data;
      const activeEmps = empList.filter((e: any) => e.status === '在职');
      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });

      // 薪资（本月 + 上月）
      const [salRes, salPrevRes] = await Promise.all([
        api.get(`/salary_records?select=*&period=eq.${period}`),
        api.get(`/salary_records?select=*&period=eq.${prev}`),
      ]);
      const salList: any[] = salRes.data;
      const salPrevList: any[] = salPrevRes.data;
      const salMap: Record<string, any> = {};
      salList.forEach((r: any) => { salMap[r.unique_hash] = r; });
      const salPrevMap: Record<string, any> = {};
      salPrevList.forEach((r: any) => { salPrevMap[r.unique_hash] = r; });

      // 附加薪酬（本月 + 上月）
      const [addRes, addPrevRes] = await Promise.all([
        api.get(`/additional_salary_records?select=*&period=eq.${period}`),
        api.get(`/additional_salary_records?select=*&period=eq.${prev}`),
      ]);
      const addMap: Record<string, any> = {};
      addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });
      const addPrevMap: Record<string, any> = {};
      addPrevRes.data.forEach((r: any) => { addPrevMap[r.unique_hash] = r; });

      // 社保
      const welfareRes = await api.get(`/employee_welfare_records?select=unique_hash,personal_total,company_total&period=eq.${period}`);
      const welfareMap: Record<string, any> = {};
      welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });

      // 考勤（本月 + 上月，取加班金额）
      const [attRes, attPrevRes] = await Promise.all([
        api.get(`/attendance_records?select=unique_hash,attendance_adjust_total,overtime_amount&period=eq.${period}`),
        api.get(`/attendance_records?select=unique_hash,overtime_amount&period=eq.${prev}`),
      ]);
      const attMap: Record<string, any> = {};
      attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });
      const attPrevMap: Record<string, any> = {};
      attPrevRes.data.forEach((r: any) => { attPrevMap[r.unique_hash] = r; });

      // ===== 汇总统计 =====
      const totalNetPay = salList.reduce((s: number, r: any) => s + (r.net_pay || 0), 0);
      const totalCost = salList.reduce((s: number, r: any) => s + (r.total_cost || 0), 0);
      setStats({ employee_count: activeEmps.length, total_net_pay: totalNetPay, total_cost: totalCost });

      // ===== 图表1：人数分布（部门 + 成本中心） =====
      const buildHeadcount = (groupKey: 'department' | 'cost_center') => {
        const byGroup: Record<string, number> = {};
        activeEmps.forEach((e: any) => {
          const g = e[groupKey] || '未分配';
          byGroup[g] = (byGroup[g] || 0) + 1;
        });
        const total = activeEmps.length || 1;
        return Object.entries(byGroup)
          .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
          .sort((a, b) => b.count - a.count || zhCompare(a.name, b.name));
      };
      setHeadcountData({ dept: buildHeadcount('department'), cost: buildHeadcount('cost_center') });

      // ===== 图表2：各部门平均实发工资 =====
      const netByDept: Record<string, { sum: number; count: number; list: number[] }> = {};
      salList.forEach((r: any) => {
        const emp = empMap[r.unique_hash];
        if (!emp) return;
        const dept = emp.department || '未分配';
        if (!netByDept[dept]) netByDept[dept] = { sum: 0, count: 0, list: [] };
        netByDept[dept].sum += r.net_pay || 0;
        netByDept[dept].count++;
        netByDept[dept].list.push(Number(r.net_pay || 0));
      });
      // 公司加权平均 = 全公司实发总额 / 有薪资记录人数
      const salEmpCount = salList.filter((r: any) => empMap[r.unique_hash]).length || 1;
      const companyAvg = Number((totalNetPay / salEmpCount).toFixed(2));
      setCompanyAvgNet(companyAvg);
      const avgList = Object.entries(netByDept)
        .map(([name, d]) => ({
          name,
          avg: Number((d.sum / d.count).toFixed(2)),
          count: d.count,
          median: Number(median(d.list).toFixed(2)),
          above: Number((d.sum / d.count).toFixed(2)) >= companyAvg,
        }))
        .sort((a, b) => b.avg - a.avg || zhCompare(a.name, b.name));
      setAvgPayList(avgList);

      // ===== 图表3：薪资区间分布（按实发） =====
      const netVals: number[] = salList.map((r: any) => Number(r.net_pay || 0)).filter(x => x > 0);
      setSalaryMedian(Number(median(netVals).toFixed(2)));
      setSalaryDist(buildBins(netVals));

      // ===== 图表4：工资构成占比（应发构成） =====
      const perfComm = (add: any) => (add.performance_pay || 0) + (add.kpi_provision || 0) + (add.office_comm || 0) + (add.apartment_comm || 0) + (add.talent_kpi || 0);
      const allowSum = (add: any) => (add.allowance_supp || 0) + (add.other_adjust || 0) + (add.heat_allowance || 0) + (add.other_allowance || 0) + (add.security_bonus || 0) + (add.cleaning_bonus || 0);
      const calcComp = (salArr: any[], addMapX: Record<string, any>, attMapX: Record<string, any>) => {
        const c = { '基本工资': 0, '绩效&佣金': 0, '津贴补贴': 0, '加班费': 0, '其他': 0 };
        salArr.forEach((r: any) => {
          const add = addMapX[r.unique_hash] || {};
          c['基本工资'] += Number(r.base_salary || 0);
          c['绩效&佣金'] += perfComm(add);
          c['津贴补贴'] += allowSum(add);
          c['加班费'] += Number(attMapX[r.unique_hash]?.overtime_amount || 0);
          c['其他'] += Number(add.insurance_amount || 0);
        });
        return c;
      };
      const compCur = calcComp(salList, addMap, attMap);
      const compPrev = calcComp(salPrevList, addPrevMap, attPrevMap);
      const colorMap: Record<string, string> = { '基本工资': BRAND, '绩效&佣金': ORANGE, '津贴补贴': NEUTRAL, '加班费': WARNING, '其他': '#bfbfbf' };
      const order = ['基本工资', '绩效&佣金', '津贴补贴', '加班费', '其他'];
      const totalComp = order.reduce((s, k) => s + compCur[k], 0) || 1;
      const compArr = order.map((k, i) => {
        const val = Number(compCur[k].toFixed(2));
        const prevVal = Number(compPrev[k].toFixed(2));
        const chg = prevVal ? Number((((val - prevVal) / prevVal) * 100).toFixed(1)) : 0;
        return {
          name: k, value: val,
          pct: Number(((val / totalComp) * 100).toFixed(1)),
          color: colorMap[k], prevVal, chg,
          isOther: k === '其他',
        };
      }).sort((a, b) => b.value - a.value);
      // 「其他」固定在底部
      const others = compArr.filter(c => c.isOther);
      const main = compArr.filter(c => !c.isOther);
      setComposition([...main, ...others]);

      // ===== Summary 汇总表（保留） =====
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
          byGroup[g].net += r.net_pay || 0;
          byGroup[g].company_welfare += welfareMap[r.unique_hash]?.company_total || 0;
          byGroup[g].personal_welfare += welfareMap[r.unique_hash]?.personal_total || 0;
          byGroup[g].perf_comm += perfComm(add);
          byGroup[g].attendance_adjust += attMap[r.unique_hash]?.attendance_adjust_total || 0;
          byGroup[g].insurance += add.insurance_amount || 0;
          byGroup[g].provision += r.provision_welfare || 0;
          byGroup[g].total_cost += r.total_cost || 0;
        });
        return Object.values(byGroup).map((g: any) => ({ ...g, key: g.group }));
      };
      setSummaryRows(buildSummary(summaryTab === 'company' ? 'pay_company' : 'cost_center'));

      // ===== 花名册变动 =====
      const additions = activeEmps.filter((e: any) => e.entry_date && e.entry_date.startsWith(period)).map((e: any) => ({ key: e.unique_hash, name: e.name, department: e.department || '', date: e.entry_date, cost_center: e.cost_center || '' }));
      const removals = empList.filter((e: any) => e.leave_date && e.leave_date.startsWith(period)).map((e: any) => ({ key: e.unique_hash, name: e.name, department: e.department || '', date: e.leave_date, cost_center: e.cost_center || '' }));
      const prevActiveCount = activeEmps.length - additions.length + removals.length;
      setRosterChanges({ additions, removals, prevActiveCount });
    } catch { message.error('加载数据总览失败'); }
    finally { setLoading(false); }
  };

  // ===== 图表1：人数分布 =====
  useEffect(() => {
    const el = headcountRef.current;
    if (!el) return;
    const chart = echarts.getInstanceByDom(el) || echarts.init(el);
    const data = headcountView === 'dept' ? headcountData.dept : headcountData.cost;
    const empty = data.length === 0;
    const showData = empty ? Array.from({ length: 8 }, () => ({ name: '', count: 1, pct: 0 })) : data;
    const maxVal = Math.max(...showData.map(d => d.count), 1);
    chart.setOption({
      grid: { left: 8, right: 90, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item', formatter: (p: any) => empty ? '' : `${p.name}：${p.data.value}人（${p.data.pct}%）` },
      xAxis: { type: 'value', show: false, max: maxVal * 1.25 },
      yAxis: {
        type: 'category',
        data: showData.map(d => d.name),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#666', width: 90, overflow: 'truncate' },
      },
      series: [{
        type: 'bar',
        data: showData.map((d, i) => ({
          value: d.count,
          pct: d.pct,
          itemStyle: empty ? { color: PLACEHOLDER } : { color: BRAND, borderRadius: [0, 4, 4, 0] },
        })),
        barWidth: 14,
        label: {
          show: true, position: 'right', color: '#333',
          formatter: (p: any) => empty ? '' : `${p.data.value}人（${p.data.pct}%）`,
        },
        emphasis: {
          focus: 'series',
          itemStyle: { color: '#0958d9' },
        },
        blur: { itemStyle: { opacity: 0.3 } },
      }],
      graphic: empty ? [{ type: 'text', left: 'center', top: 'middle', style: { text: '暂无数据', fill: '#999', fontSize: 14 } }] : [],
    });
    return () => { chart.dispose(); };
  }, [headcountData, headcountView]);

  // ===== 图表2：各部门平均实发工资 =====
  useEffect(() => {
    const el = avgRef.current;
    if (!el) return;
    const chart = echarts.getInstanceByDom(el) || echarts.init(el);
    const empty = avgPayList.length === 0;
    const showData = empty ? Array.from({ length: 8 }, () => ({ name: '', avg: 1, count: 0, median: 0, above: false })) : avgPayList;
    const maxVal = Math.max(...showData.map(d => d.avg), companyAvgNet, 1);
    chart.setOption({
      grid: { left: 8, right: 100, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => empty ? '' : `${p.name}<br/>平均实发：¥${Number(p.data.value).toLocaleString('zh-CN')}<br/>样本量：${p.data.count}人<br/>中位数：¥${Number(p.data.median).toLocaleString('zh-CN')}`,
      },
      xAxis: { type: 'value', show: false, max: maxVal * 1.25 },
      yAxis: {
        type: 'category', data: showData.map(d => d.name),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#666', width: 90, overflow: 'truncate' },
      },
      series: [{
        type: 'bar',
        data: showData.map((d) => ({
          value: d.avg, count: d.count, median: d.median,
          itemStyle: empty ? { color: PLACEHOLDER } : { color: d.above ? BRAND : '#c9c9c9', borderRadius: [0, 4, 4, 0] },
        })),
        barWidth: 14,
        label: {
          show: true, position: 'right', color: '#333',
          formatter: (p: any) => empty ? '' : `${fmtMoneyInt(p.data.value)}${p.data.count === 1 ? '（仅1人）' : ''}`,
        },
        emphasis: { focus: 'series', itemStyle: { color: '#0958d9' } },
        blur: { itemStyle: { opacity: 0.3 } },
        markLine: empty ? undefined : {
          silent: true, symbol: 'none',
          lineStyle: { color: '#999', type: 'dashed', width: 1 },
          label: { formatter: `公司平均 ${fmtMoneyInt(companyAvgNet)}`, position: 'insideEndTop', color: '#999', fontSize: 11 },
          data: [{ xAxis: companyAvgNet }],
        },
      }],
      graphic: empty ? [{ type: 'text', left: 'center', top: 'middle', style: { text: '暂无薪资数据', fill: '#999', fontSize: 14 } }] : [],
    });
    return () => { chart.dispose(); };
  }, [avgPayList, companyAvgNet]);

  // ===== 图表3：薪资区间分布 =====
  useEffect(() => {
    const el = histRef.current;
    if (!el) return;
    const chart = echarts.getInstanceByDom(el) || echarts.init(el);
    const empty = salaryDist.length === 0;
    const showData = empty ? Array.from({ length: 6 }, (_, i) => ({ label: '', count: 1, pct: 0 })) : salaryDist;
    const maxVal = Math.max(...showData.map(d => d.count), 1);
    chart.setOption({
      grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item', formatter: (p: any) => empty ? '' : `${p.name}：${p.data.value}人（${p.data.pct}%）` },
      xAxis: { type: 'value', show: false, max: maxVal * 1.25 },
      yAxis: {
        type: 'category', data: showData.map(d => d.label),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#666', fontSize: 11 },
      },
      series: [{
        type: 'bar',
        data: showData.map((d, i) => ({
          value: d.count, pct: d.pct,
          itemStyle: empty
            ? { color: PLACEHOLDER }
            : { color: `rgba(22,119,255,${0.25 + (i / Math.max(showData.length - 1, 1)) * 0.7})`, borderRadius: [0, 4, 4, 0] },
        })),
        barWidth: 16,
        label: {
          show: true, position: 'right', color: '#333',
          formatter: (p: any) => empty ? '' : `${p.data.value}人（${p.data.pct}%）`,
        },
      }],
      graphic: empty ? [{ type: 'text', left: 'center', top: 'middle', style: { text: '暂无数据', fill: '#999', fontSize: 14 } }] : [],
    });
    return () => { chart.dispose(); };
  }, [salaryDist, salaryMedian]);

  // ===== 图表4：工资构成占比 =====
  useEffect(() => {
    const el = donutRef.current;
    if (!el) return;
    const chart = echarts.getInstanceByDom(el) || echarts.init(el);
    const empty = composition.length === 0;
    const showData = empty ? Array.from({ length: 6 }, () => ({ name: '—', value: 1 })) : composition;
    chart.setOption({
      tooltip: { trigger: 'item', formatter: (p: any) => empty ? '' : `${p.name}：¥${Number(p.value).toLocaleString('zh-CN')}（${p.percent}%）` },
      series: [{
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        selectedMode: 'single',
        selectedOffset: 12,
        label: { show: false },
        data: showData.map((c, i) => ({
          name: c.name,
          value: c.value,
          itemStyle: empty
            ? { color: '#e8e8e8' }
            : { color: c.color, opacity: selectedDonut === -1 || selectedDonut === i ? 1 : 0.3 },
        })),
      }],
    });
    return () => { chart.dispose(); };
  }, [composition, selectedDonut]);

  const maxComposition = useMemo(() => Math.max(...composition.map(c => c.value), 1), [composition]);

  const toggleDonut = (idx: number) => {
    setSelectedDonut(prev => prev === idx ? -1 : idx);
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

  const headCountTotal = (headcountView === 'dept' ? headcountData.dept : headcountData.cost).length;
  const headCountSum = (headcountView === 'dept' ? headcountData.dept : headcountData.cost).reduce((s, d) => s + d.count, 0);

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

      {/* 统计分析：2×2 图表网格 */}
      <Card size="small" title="统计分析" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          {/* 左上：各部门人数分布 */}
          <Col xs={24} xl={12}>
            <Card size="small" title="各部门人数分布"
              extra={<Segmented size="small" value={headcountView} onChange={(v) => setHeadcountView(v as 'dept' | 'cost')} options={[{ label: '按部门', value: 'dept' }, { label: '按成本中心', value: 'cost' }]} />}>
              <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
                共 {headCountTotal} 个{headcountView === 'dept' ? '部门' : '成本中心'}，{headCountSum} 名员工
              </div>
              <div ref={headcountRef} style={{ width: '100%', height: 300 }} />
            </Card>
          </Col>

          {/* 右上：各部门平均实发工资 */}
          <Col xs={24} xl={12}>
            <Card size="small" title="各部门平均实发工资">
              <div ref={avgRef} style={{ width: '100%', height: 300 }} />
            </Card>
          </Col>

          {/* 左下：薪资区间分布 */}
          <Col xs={24} xl={12}>
            <Card size="small" title="薪资区间分布">
              <div ref={histRef} style={{ width: '100%', height: 300 }} />
              {salaryDist.length > 0 && (
                <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
                  中位数 {fmtMoneyInt(salaryMedian)}；区间按当月实发工资动态划分，共 {salaryDist.length} 档。
                </div>
              )}
            </Card>
          </Col>

          {/* 右下：工资构成占比 */}
          <Col xs={24} xl={12}>
            <Card size="small" title="工资构成占比（应发口径）">
              <Row align="middle">
                <Col span={12}>
                  <div ref={donutRef} style={{ width: '100%', height: 300 }} />
                </Col>
                <Col span={12}>
                  {composition.map((c, idx) => {
                    const pctOfMax = maxComposition > 0 ? Math.round((c.value / maxComposition) * 100) : 0;
                    return (
                      <div
                        key={c.name}
                        style={{ marginBottom: 12, cursor: 'pointer', opacity: selectedDonut === -1 || selectedDonut === idx ? 1 : 0.4 }}
                        onClick={() => toggleDonut(idx)}
                        onMouseEnter={() => setDonutHover(idx)}
                        onMouseLeave={() => setDonutHover(null)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: c.color }} />
                            <span>{c.name}</span>
                          </span>
                          <span style={{ fontSize: 12 }}>{fmtMoney(c.value)}（{c.pct}%）</span>
                        </div>
                        <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                          <div style={{ height: 6, width: `${pctOfMax}%`, background: c.color, borderRadius: 3 }} />
                        </div>
                        {donutHover === idx && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            较上月 {c.chg >= 0 ? '+' : ''}{c.chg}%
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 花名册变动分析 */}
      <Card title="花名册变动分析" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge count={rosterChanges.additions.length} style={{ backgroundColor: '#27ae60' }} showZero />
              <span style={{ color: '#27ae60', fontWeight: 600, fontSize: 15 }}>新增</span>
              <Tag color="green">上月 {rosterChanges.prevActiveCount ?? '—'} 人</Tag>
            </div>
            <Table size="small" pagination={false}
              dataSource={expandAdd ? rosterChanges.additions : rosterChanges.additions.slice(0, 5)}
              columns={changeColumns('入职日期')} />
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
            <Table size="small" pagination={false}
              dataSource={expandRemove ? rosterChanges.removals : rosterChanges.removals.slice(0, 5)}
              columns={changeColumns('离职日期')} />
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
        <Tabs activeKey={summaryTab} onChange={(k) => { setSummaryTab(k as 'dept' | 'company'); }}
          items={[
            { key: 'company', label: '按公司' },
            { key: 'dept', label: '按部门' },
          ]} />
        <div style={{ overflowX: 'auto' }}>
          <Table columns={summaryColumns} dataSource={summaryRows} loading={loading} size="small" pagination={false} scroll={{ x: 1300 }} />
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
