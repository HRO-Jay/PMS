import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Statistic, Space, Input, message, Table, Tabs, Tag, Badge, Button, Segmented } from 'antd';
import {
  TeamOutlined, DollarOutlined, SafetyCertificateOutlined, CalculatorOutlined,
  BankOutlined, AccountBookOutlined, UserOutlined, DownloadOutlined, ReloadOutlined,
} from '@ant-design/icons';
import * as echarts from 'echarts';
import api from '../api/client';
import { exportXlsx, type ExportDef } from '../utils/importExport';

const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

// ===== 10 色循环颜色库 =====
const PALETTE = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#f97316'];
const paletteColor = (i: number) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

// ===== 商务配色体系（文字/边框/占位） =====
const BRAND = '#1e3a5f';
const BRAND_2 = '#3b7dd8';
const GOLD = '#c9a227';
const PLACEHOLDER = '#eef1f4';
const GREEN = '#2e7d5b';
const RED = '#c0392b';
const INK = '#1f2937';
const INK_SUB = '#6b7280';
const BORDER = '#e6e9ef';

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtMoneyInt = (v: any) => {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return '¥0';
  return `¥${Math.round(Number(v)).toLocaleString('zh-CN')}`;
};

/** 卡片圆角+浅阴影通用样式 */
const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.04)',
  border: `1px solid ${BORDER}`,
};

/** ECharts 通用浅灰虚线网格 */
const gridLine = { lineStyle: { type: 'dashed' as const, color: '#eceff3' } };

/** ECharts 通用轴标签：文字始终横排 */
const horizontalAxisLabel = { color: INK_SUB, fontSize: 12, rotate: 0, interval: 0 };

/** 类目标签单行截断，避免中文换行竖排 */
function truncateLabel(v: string, max = 8): string {
  if (v == null) return '';
  const s = String(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** 数值轴千分位格式化 */
function axisMoney(v: number): string {
  if (v >= 10000) return `${(v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}万`;
  return v.toLocaleString('zh-CN');
}

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

/** 动态等宽分箱（4-6 个区间），返回区间边界与统计 */
function buildBins(values: number[]): { lo: number; hi: number; label: string; count: number; pct: number }[] {
  const v = values.filter(x => Number(x) > 0);
  if (!v.length) return [];
  const min = Math.min(...v);
  const max = Math.max(...v);
  if (min === max) {
    return [{ lo: min, hi: max, label: `¥${Math.round(min).toLocaleString('zh-CN')}`, count: v.length, pct: 100 }];
  }
  const step = niceStep((max - min) / 5);
  const start = Math.floor(min / step) * step;
  const bins: { lo: number; hi: number; count: number }[] = [];
  let lo = start;
  while (lo < max) { bins.push({ lo, hi: lo + step, count: 0 }); lo += step; }
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
    else label = `${loFmt}-${hiFmt}`;
    return { lo: b.lo, hi: b.hi, label, count: b.count, pct: Math.round((b.count / total) * 100) };
  });
}

const zhCompare = (a: string, b: string) => a.localeCompare(b, 'zh-Hans-CN');

/** 环比百分比 */
function chgPct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

const Dashboard: React.FC = () => {
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);
  const [summaryTab, setSummaryTab] = useState<'dept' | 'company'>('company');
  const [stats, setStats] = useState<any>(null);
  const [prevStats, setPrevStats] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [summaryRows, setSummaryRows] = useState<any[]>([]);
  const [rosterChanges, setRosterChanges] = useState<{ additions: any[]; removals: any[]; prevActiveCount?: number }>({ additions: [], removals: [] });
  const [expandAdd, setExpandAdd] = useState(false);
  const [expandRemove, setExpandRemove] = useState(false);

  // 图表1：各部门薪资分布（分组柱）
  const [groupView, setGroupView] = useState<'dept' | 'cost'>('dept');
  const [groupData, setGroupData] = useState<{ dept: any[]; cost: any[] }>({ dept: [], cost: [] });
  // 图表2：薪资区间人数分布（纵向柱）
  const [salaryDist, setSalaryDist] = useState<any[]>([]);
  const [salaryMedian, setSalaryMedian] = useState(0);
  // 图表3：各部门平均实发工资（横向条）
  const [avgPayList, setAvgPayList] = useState<any[]>([]);
  const [companyAvgNet, setCompanyAvgNet] = useState(0);
  // 图表4：工资构成占比（环形图）
  const [composition, setComposition] = useState<any[]>([]);
  const [selectedDonut, setSelectedDonut] = useState(-1);
  const [donutHover, setDonutHover] = useState<number | null>(null);

  const groupRef = React.useRef<HTMLDivElement>(null);
  const histRef = React.useRef<HTMLDivElement>(null);
  const avgRef = React.useRef<HTMLDivElement>(null);
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
      const empRes = await api.get('/employees?select=unique_hash,name,status,pay_company,cost_center,department,entry_date,leave_date,basic_salary');
      const empList: any[] = empRes.data;
      const activeEmps = empList.filter((e: any) => e.status === '在职');
      const empMap: Record<string, any> = {};
      empList.forEach((e: any) => { empMap[e.unique_hash] = e; });

      const [salRes, salPrevRes] = await Promise.all([
        api.get(`/salary_records?select=*&period=eq.${period}`),
        api.get(`/salary_records?select=*&period=eq.${prev}`),
      ]);
      const salList: any[] = salRes.data;
      const salPrevList: any[] = salPrevRes.data;
      const salMap: Record<string, any> = {};
      salList.forEach((r: any) => { salMap[r.unique_hash] = r; });

      const [addRes, addPrevRes] = await Promise.all([
        api.get(`/additional_salary_records?select=*&period=eq.${period}`),
        api.get(`/additional_salary_records?select=*&period=eq.${prev}`),
      ]);
      const addMap: Record<string, any> = {};
      addRes.data.forEach((r: any) => { addMap[r.unique_hash] = r; });
      const addPrevMap: Record<string, any> = {};
      addPrevRes.data.forEach((r: any) => { addPrevMap[r.unique_hash] = r; });

      const welfareRes = await api.get(`/employee_welfare_records?select=unique_hash,personal_total,company_total&period=eq.${period}`);
      const welfareMap: Record<string, any> = {};
      welfareRes.data.forEach((r: any) => { welfareMap[r.unique_hash] = r; });

      const [attRes, attPrevRes] = await Promise.all([
        api.get(`/attendance_records?select=unique_hash,attendance_adjust_total,overtime_amount&period=eq.${period}`),
        api.get(`/attendance_records?select=unique_hash,overtime_amount&period=eq.${prev}`),
      ]);
      const attMap: Record<string, any> = {};
      attRes.data.forEach((r: any) => { attMap[r.unique_hash] = r; });
      const attPrevMap: Record<string, any> = {};
      attPrevRes.data.forEach((r: any) => { attPrevMap[r.unique_hash] = r; });

      // ===== 核心指标（口径严格） =====
      const sum = (arr: any[], key: string) => arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);
      const totalWageSubtotal = Number(sum(salList, 'wage_subtotal').toFixed(2));   // 应发工资总计
      const totalPersonalWelfare = Number(sum(salList, 'personal_welfare_total').toFixed(2)); // 社保公积金扣除
      const totalTax = Number(sum(salList, 'monthly_tax').toFixed(2));               // 个税总计
      const totalNetPay = Number(sum(salList, 'net_pay').toFixed(2));                // 实发工资总计
      const totalCompanyWelfare = Number(sum(salList, 'company_welfare_total').toFixed(2));
      const totalCost = Number((totalWageSubtotal + totalCompanyWelfare).toFixed(2)); // 当月人力成本
      const salEmpCount = salList.filter((r: any) => empMap[r.unique_hash]).length || 1;
      const avgNet = Number((totalNetPay / salEmpCount).toFixed(2));                 // 人均实发

      setStats({
        employee_count: activeEmps.length,
        total_wage_subtotal: totalWageSubtotal,
        total_personal_welfare: totalPersonalWelfare,
        total_tax: totalTax,
        total_net_pay: totalNetPay,
        total_cost: totalCost,
        avg_net: avgNet,
      });

      // 上月核心指标（环比用）
      const prevWageSubtotal = Number(sum(salPrevList, 'wage_subtotal').toFixed(2));
      const prevPersonalWelfare = Number(sum(salPrevList, 'personal_welfare_total').toFixed(2));
      const prevTax = Number(sum(salPrevList, 'monthly_tax').toFixed(2));
      const prevNetPay = Number(sum(salPrevList, 'net_pay').toFixed(2));
      const prevCost = Number((prevWageSubtotal + Number(sum(salPrevList, 'company_welfare_total').toFixed(2))).toFixed(2));
      const prevSalCount = salPrevList.filter((r: any) => empMap[r.unique_hash]).length || 1;
      const prevAvgNet = Number((prevNetPay / prevSalCount).toFixed(2));
      setPrevStats({
        employee_count: activeEmps.length,
        total_wage_subtotal: prevWageSubtotal,
        total_personal_welfare: prevPersonalWelfare,
        total_tax: prevTax,
        total_net_pay: prevNetPay,
        total_cost: prevCost,
        avg_net: prevAvgNet,
      });

      // 数据状态：有薪资记录且含已计算/已锁定状态视为就绪
      setReady(salList.length > 0 && salList.some((r: any) => r.data_status === '已计算' || r.data_status === '已锁定' || r.data_status === '已提交老板查看'));

      // ===== 图表1：各部门薪资分布（分组柱） =====
      const buildGroup = (groupKey: 'department' | 'cost_center') => {
        const byGroup: Record<string, { gross: number; net: number; count: number; deduct: number; netList: number[] }> = {};
        salList.forEach((r: any) => {
          const emp = empMap[r.unique_hash];
          if (!emp) return;
          const g = emp[groupKey] || '未分配';
          if (!byGroup[g]) byGroup[g] = { gross: 0, net: 0, count: 0, deduct: 0, netList: [] };
          byGroup[g].gross += Number(r.wage_subtotal || 0);
          byGroup[g].net += Number(r.net_pay || 0);
          byGroup[g].count++;
          byGroup[g].netList.push(Number(r.net_pay || 0));
        });
        return Object.entries(byGroup)
          .map(([name, d]) => ({
            name,
            gross: Number(d.gross.toFixed(2)),
            net: Number(d.net.toFixed(2)),
            deduct: Number((d.gross - d.net).toFixed(2)),
            count: d.count,
            avgNet: d.count ? Number((d.net / d.count).toFixed(2)) : 0,
          }))
          .sort((a, b) => b.gross - a.gross || zhCompare(a.name, b.name));
      };
      setGroupData({ dept: buildGroup('department'), cost: buildGroup('cost_center') });

      // ===== 图表2：薪资区间人数分布（按实发） =====
      const netVals: number[] = salList.map((r: any) => Number(r.net_pay || 0)).filter(x => x > 0);
      setSalaryMedian(Number(median(netVals).toFixed(2)));
      setSalaryDist(buildBins(netVals));

      // ===== 图表3：各部门平均实发工资 =====
      const companyAvg = Number((totalNetPay / salEmpCount).toFixed(2));
      setCompanyAvgNet(companyAvg);
      const netByDept: Record<string, { sum: number; count: number; list: number[] }> = {};
      salList.forEach((r: any) => {
        const emp = empMap[r.unique_hash];
        if (!emp) return;
        const dept = emp.department || '未分配';
        if (!netByDept[dept]) netByDept[dept] = { sum: 0, count: 0, list: [] };
        netByDept[dept].sum += Number(r.net_pay || 0);
        netByDept[dept].count++;
        netByDept[dept].list.push(Number(r.net_pay || 0));
      });
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

      // ===== 图表4：工资构成占比（应发口径） =====
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
      const colorMap: Record<string, string> = { '基本工资': paletteColor(0), '绩效&佣金': paletteColor(1), '津贴补贴': paletteColor(2), '加班费': paletteColor(3), '其他': paletteColor(4) };
      const order = ['基本工资', '绩效&佣金', '津贴补贴', '加班费', '其他'];
      const totalComp = order.reduce((s, k) => s + compCur[k], 0) || 1;
      const compArr = order.map((k) => {
        const val = Number(compCur[k].toFixed(2));
        const prevVal = Number(compPrev[k].toFixed(2));
        const chg = chgPct(val, prevVal);
        return { name: k, value: val, pct: Number(((val / totalComp) * 100).toFixed(1)), color: colorMap[k], prevVal, chg, isOther: k === '其他' };
      }).sort((a, b) => b.value - a.value);
      const others = compArr.filter(c => c.isOther);
      const main = compArr.filter(c => !c.isOther);
      setComposition([...main, ...others]);

      // ===== Summary 汇总表 =====
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
          byGroup[g].net += Number(r.net_pay || 0);
          byGroup[g].company_welfare += Number(welfareMap[r.unique_hash]?.company_total || 0);
          byGroup[g].personal_welfare += Number(welfareMap[r.unique_hash]?.personal_total || 0);
          byGroup[g].perf_comm += perfComm(add);
          byGroup[g].attendance_adjust += Number(attMap[r.unique_hash]?.attendance_adjust_total || 0);
          byGroup[g].insurance += Number(add.insurance_amount || 0);
          byGroup[g].provision += Number(r.provision_welfare || 0);
          byGroup[g].total_cost += Number(r.total_cost || 0);
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

  // ===== 图表1：各部门薪资分布（分组柱） =====
  useEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    const chart = echarts.getInstanceByDom(el) || echarts.init(el);
    const data = groupView === 'dept' ? groupData.dept : groupData.cost;
    const empty = data.length === 0;
    const showData = empty ? Array.from({ length: 6 }, () => ({ name: '', gross: 1, net: 1, deduct: 0, count: 0, avgNet: 0 })) : data;
    const maxVal = Math.max(...showData.map(d => Math.max(d.gross, d.net)), 1);
    const showLabel = data.length <= 8;
    chart.setOption({
      grid: { left: 8, right: 70, top: 36, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(30,58,95,0.04)' } },
        backgroundColor: 'rgba(23,32,46,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          if (empty) return '';
          const name = params[0]?.name;
          const d = data.find(x => x.name === name);
          if (!d) return '';
          return `<div style="font-weight:600;margin-bottom:4px">${d.name}</div>应发工资　¥${d.gross.toLocaleString('zh-CN')}<br/>实发工资　¥${d.net.toLocaleString('zh-CN')}<br/>扣减合计　¥${d.deduct.toLocaleString('zh-CN')}<br/>部门人数　${d.count}人<br/>人均实发　¥${d.avgNet.toLocaleString('zh-CN')}`;
        },
      },
      legend: { data: ['应发工资', '实发工资'], top: 0, right: 0, itemWidth: 14, itemHeight: 8, textStyle: { color: INK_SUB, fontSize: 12 }, icon: 'roundRect' },
      xAxis: {
        type: 'category',
        data: showData.map(d => truncateLabel(d.name, 8)),
        axisLine: { lineStyle: { color: BORDER } },
        axisTick: { show: false },
        axisLabel: { ...horizontalAxisLabel, formatter: (v: string) => truncateLabel(v, 8) },
      },
      yAxis: {
        type: 'value',
        min: 0,
        splitLine: gridLine,
        axisLabel: { color: INK_SUB, fontSize: 11, formatter: (v: number) => axisMoney(v) },
      },
      series: [
        {
          name: '应发工资', type: 'bar', barWidth: 16,
          data: showData.map(d => ({ value: d.gross, itemStyle: empty ? { color: PLACEHOLDER } : { color: paletteColor(0), borderRadius: [4, 4, 0, 0] } })),
          label: showLabel ? { show: true, position: 'top', color: INK_SUB, fontSize: 11, formatter: (p: any) => empty ? '' : fmtMoneyInt(p.value) } : { show: false },
        },
        {
          name: '实发工资', type: 'bar', barWidth: 16,
          data: showData.map(d => ({ value: d.net, itemStyle: empty ? { color: PLACEHOLDER } : { color: paletteColor(1), borderRadius: [4, 4, 0, 0], opacity: 0.85 } })),
          label: showLabel ? { show: true, position: 'top', color: '#9aa4b2', fontSize: 11, formatter: (p: any) => empty ? '' : fmtMoneyInt(p.value) } : { show: false },
        },
      ],
      graphic: empty ? [{ type: 'text', left: 'center', top: 'middle', style: { text: '暂无数据', fill: '#999', fontSize: 14 } }] : [],
    });
    return () => { chart.dispose(); };
  }, [groupData, groupView]);

  // ===== 图表2：薪资区间人数分布（纵向柱） =====
  useEffect(() => {
    const el = histRef.current;
    if (!el) return;
    const chart = echarts.getInstanceByDom(el) || echarts.init(el);
    const empty = salaryDist.length === 0;
    const showData = empty ? Array.from({ length: 5 }, () => ({ label: '', count: 1, pct: 0 })) : salaryDist;
    const maxVal = Math.max(...showData.map(d => d.count), 1);
    // 中位数所在区间索引
    let medianIdx = -1;
    if (!empty) {
      medianIdx = salaryDist.findIndex(b => salaryMedian >= b.lo && salaryMedian < b.hi);
      if (medianIdx === -1 && salaryDist.length) medianIdx = salaryDist.length - 1;
    }
    const medianLine = (!empty && medianIdx >= 0) ? {
      silent: true, symbol: 'none',
      lineStyle: { color: GOLD, type: 'dashed', width: 1.5 },
      label: { formatter: `中位数 ${fmtMoneyInt(salaryMedian)}`, color: '#8a6d1f', fontSize: 11, position: 'insideEndTop' },
      data: [{ xAxis: showData[medianIdx].label }],
    } : undefined;
    chart.setOption({
      grid: { left: 8, right: 40, top: 36, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(30,58,95,0.04)' } },
        backgroundColor: 'rgba(23,32,46,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => empty ? '' : `${params[0]?.name}：${params[0]?.data?.count}人（${params[0]?.data?.pct}%）`,
      },
      xAxis: {
        type: 'category', data: showData.map(d => truncateLabel(d.label, 10)),
        axisLine: { lineStyle: { color: BORDER } }, axisTick: { show: false },
        axisLabel: { ...horizontalAxisLabel, fontSize: 11, formatter: (v: string) => truncateLabel(v, 10) },
      },
      yAxis: { type: 'value', min: 0, splitLine: gridLine, axisLabel: { color: INK_SUB, fontSize: 11, formatter: (v: number) => v.toLocaleString('zh-CN') } },
      series: [{
        type: 'bar',
        barWidth: 28,
        data: showData.map(d => ({
          value: d.count, count: d.count, pct: d.pct,
          itemStyle: empty ? { color: PLACEHOLDER } : {
            borderRadius: [5, 5, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: paletteColor(6) }, { offset: 1, color: 'rgba(16,185,129,0.55)' },
            ]),
          },
        })),
        label: {
          show: true, position: 'top', color: INK, fontSize: 12, fontWeight: 600,
          formatter: (p: any) => empty ? '' : `${p.data.value.toLocaleString('zh-CN')}人（${p.data.pct}%）`,
        },
        emphasis: { itemStyle: { color: paletteColor(6) } },
        markLine: medianLine,
      }],
      graphic: empty ? [{ type: 'text', left: 'center', top: 'middle', style: { text: '暂无数据', fill: '#9aa4b2', fontSize: 14 } }] : [],
    });
    return () => { chart.dispose(); };
  }, [salaryDist, salaryMedian]);

  // ===== 图表3：各部门平均实发工资（横向条） =====
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
        backgroundColor: 'rgba(23,32,46,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
        formatter: (p: any) => empty ? '' : `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>平均实发　¥${Number(p.data.value).toLocaleString('zh-CN')}<br/>样本量　${p.data.count}人<br/>中位数　¥${Number(p.data.median).toLocaleString('zh-CN')}`,
      },
      xAxis: { type: 'value', show: false, max: maxVal * 1.25 },
      yAxis: {
        type: 'category', data: showData.map(d => truncateLabel(d.name, 9)),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { ...horizontalAxisLabel, formatter: (v: string) => truncateLabel(v, 9) },
      },
      series: [{
        type: 'bar',
        data: showData.map((d) => ({
          value: d.avg, count: d.count, median: d.median,
          itemStyle: empty ? { color: PLACEHOLDER } : {
            borderRadius: [0, 4, 4, 0],
            color: d.above ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: paletteColor(0) }, { offset: 1, color: paletteColor(2) }]) : '#cfd6e0',
          },
        })),
        barWidth: 14,
        label: {
          show: true, position: 'right', color: INK, fontSize: 12, fontWeight: 600,
          formatter: (p: any) => empty ? '' : `${fmtMoneyInt(p.data.value)}${p.data.count === 1 ? '（仅1人）' : ''}`,
        },
        emphasis: { focus: 'series', itemStyle: { color: paletteColor(0) } },
        blur: { itemStyle: { opacity: 0.3 } },
        markLine: empty ? undefined : {
          silent: true, symbol: 'none',
          lineStyle: { color: GOLD, type: 'dashed', width: 1.5 },
          label: { formatter: `公司平均 ${fmtMoneyInt(companyAvgNet)}`, position: 'insideEndTop', color: '#8a6d1f', fontSize: 11 },
          data: [{ xAxis: companyAvgNet }],
        },
      }],
      graphic: empty ? [{ type: 'text', left: 'center', top: 'middle', style: { text: '暂无薪资数据', fill: '#9aa4b2', fontSize: 14 } }] : [],
    });
    return () => { chart.dispose(); };
  }, [avgPayList, companyAvgNet]);

  // ===== 图表4：工资构成占比（环形图） =====
  useEffect(() => {
    const el = donutRef.current;
    if (!el) return;
    const chart = echarts.getInstanceByDom(el) || echarts.init(el);
    const empty = composition.length === 0;
    const showData = empty ? Array.from({ length: 6 }, () => ({ name: '—', value: 1 })) : composition;
    chart.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(23,32,46,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
        formatter: (p: any) => empty ? '' : `${p.name}：¥${Number(p.value).toLocaleString('zh-CN')}（${p.percent}%）`,
      },
      series: [{
        type: 'pie',
        radius: ['50%', '74%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        selectedMode: 'single',
        selectedOffset: 12,
        label: { show: false },
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        data: showData.map((c, i) => ({
          name: c.name,
          value: c.value,
          itemStyle: empty
            ? { color: '#e8e8e8' }
            : { color: c.color, opacity: selectedDonut === -1 || selectedDonut === i ? 1 : 0.25 },
        })),
      }],
    });
    return () => { chart.dispose(); };
  }, [composition, selectedDonut]);

  const maxComposition = useMemo(() => Math.max(...composition.map(c => c.value), 1), [composition]);
  const toggleDonut = (idx: number) => setSelectedDonut(prev => prev === idx ? -1 : idx);

  // 环比标签
  const ChgTag = ({ cur, prev }: { cur: number; prev: number }) => {
    const pct = chgPct(cur, prev);
    if (pct === null) return <span style={{ fontSize: 11, color: '#bbb' }}>较上月 —</span>;
    const up = pct >= 0;
    return <span style={{ fontSize: 11, color: up ? GREEN : RED }}>较上月 {up ? '+' : ''}{pct}%</span>;
  };

  // 指标卡组件（商务化：左侧色块图标 + 右侧指标名/数值/单位）
  const MetricCard = ({ title, value, unit, icon, color, prev, warn }: { title: string; value: any; unit?: string; icon: React.ReactNode; color: string; prev?: number; warn?: boolean }) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: cardStyle.boxShadow, border: cardStyle.border, display: 'flex', alignItems: 'center', gap: 14, height: '100%' }}>
      <div style={{ width: 46, height: 46, borderRadius: 10, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, flexShrink: 0, boxShadow: `0 3px 8px ${color}33` }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: INK_SUB, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: warn ? RED : INK, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: -0.3 }}>
          {value}{unit && <span style={{ fontSize: 12, color: '#9aa4b2', fontWeight: 400, marginLeft: 4 }}>{unit}</span>}
        </div>
        {prev !== undefined && <ChgTag cur={Number(value)} prev={prev} />}
      </div>
    </div>
  );

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

  // 导出定义（Summary 数据）
  const SUMMARY_EXPORT_DEF: ExportDef = {
    module: '数据统计',
    columns: [
      { key: 'group', label: summaryTab === 'company' ? '发薪公司' : '成本中心' },
      { key: 'count', label: '人数' },
      { key: 'net', label: '实收工资' },
      { key: 'company_welfare', label: '公司福利' },
      { key: 'personal_welfare', label: '个人福利' },
      { key: 'perf_comm', label: '绩效&佣金' },
      { key: 'attendance_adjust', label: '考勤调整' },
      { key: 'insurance', label: '商保金额' },
      { key: 'provision', label: '预提福利费' },
      { key: 'total_cost', label: '人力成本总计' },
    ],
  };

  return (
    <div style={{ padding: '4px 2px' }}>
      {/* 页面标题区 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 700, color: INK, letterSpacing: -0.3 }}>数据总览</div>
          <div style={{ fontSize: 13, color: INK_SUB, marginTop: 2 }}>
            {ready ? '公司整体薪酬数据一览，实时反映工资计算结果' : '本月薪资计算中，部分数据可能存在延迟'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: INK_SUB, background: ready ? '#eef5f0' : '#fdf0ee', padding: '5px 12px', borderRadius: 999 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ready ? GREEN : RED, display: 'inline-block' }} />
            {ready ? '数据已就绪' : '本月薪资计算中'}
          </span>
          <Space>
            <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 150 }} />
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
            <Button icon={<DownloadOutlined />} onClick={() => exportXlsx(SUMMARY_EXPORT_DEF, summaryRows, period)}>导出</Button>
          </Space>
        </div>
      </div>

      {/* 核心指标卡 第一排（5张） */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col flex="1"><MetricCard title="员工总数" value={stats?.employee_count || 0} unit="人" icon={<TeamOutlined />} color={paletteColor(0)} /></Col>
        <Col flex="1"><MetricCard title="应发工资总计" value={stats?.total_wage_subtotal} unit="元" icon={<DollarOutlined />} color={paletteColor(1)} prev={prevStats?.total_wage_subtotal} /></Col>
        <Col flex="1"><MetricCard title="社保公积金扣除" value={stats?.total_personal_welfare} unit="元" icon={<SafetyCertificateOutlined />} color={paletteColor(2)} prev={prevStats?.total_personal_welfare} /></Col>
        <Col flex="1"><MetricCard title="个税总计" value={stats?.total_tax} unit="元" icon={<CalculatorOutlined />} color={paletteColor(5)} prev={prevStats?.total_tax} /></Col>
        <Col flex="1"><MetricCard title="实发工资总计" value={stats?.total_net_pay} unit="元" icon={<BankOutlined />} color={paletteColor(6)} prev={prevStats?.total_net_pay} /></Col>
      </Row>

      {/* 核心指标卡 第二排（2张，宽度对齐第一排前两张） */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col flex="2"><MetricCard title="当月人力成本" value={stats?.total_cost} unit="元" icon={<AccountBookOutlined />} color={paletteColor(7)} prev={prevStats?.total_cost} warn={stats && stats.total_cost < stats.total_wage_subtotal} /></Col>
        <Col flex="2"><MetricCard title="人均实发工资" value={stats?.avg_net} unit="元" icon={<UserOutlined />} color={paletteColor(8)} prev={prevStats?.avg_net} /></Col>
        <Col flex="1" />
      </Row>

      {/* 统计分析图表区 */}
      <Card size="small" style={{ ...cardStyle, marginBottom: 16, background: '#fafbfc' }} styles={{ body: { padding: 16 } }}>
        <Row gutter={[16, 16]}>
          {/* 第一行左：各部门薪资分布（分组柱） */}
          <Col xs={24} xl={12}>
            <Card size="small" title="各部门薪资分布" style={{ ...cardStyle, background: '#fff' }}
              extra={<Segmented size="small" value={groupView} onChange={(v) => setGroupView(v as 'dept' | 'cost')} options={[{ label: '按部门', value: 'dept' }, { label: '按成本中心', value: 'cost' }]} />}>
              <div ref={groupRef} style={{ width: '100%', height: 300 }} />
            </Card>
          </Col>

          {/* 第一行右：薪资区间人数分布（纵向柱） */}
          <Col xs={24} xl={12}>
            <Card size="small" title="薪资区间人数分布" style={{ ...cardStyle, background: '#fff' }}>
              <div ref={histRef} style={{ width: '100%', height: 300 }} />
              {salaryDist.length > 0 && (
                <div style={{ marginTop: 8, color: INK_SUB, fontSize: 12 }}>
                  中位数 {fmtMoneyInt(salaryMedian)}；区间按当月实发工资动态划分（含下限不含上限），共 {salaryDist.length} 档。
                  {salaryDist.some(b => b.pct >= 50) && <span style={{ color: RED, marginLeft: 6 }}>⚠️ 某区间人数占比超 50%，薪酬带宽可能过于集中</span>}
                </div>
              )}
            </Card>
          </Col>

          {/* 第二行左：各部门平均实发工资 */}
          <Col xs={24} xl={12}>
            <Card size="small" title="各部门平均实发工资" style={{ ...cardStyle, background: '#fff' }}>
              <div ref={avgRef} style={{ width: '100%', height: 300 }} />
            </Card>
          </Col>

          {/* 第二行右：工资构成占比 */}
          <Col xs={24} xl={12}>
            <Card size="small" title="工资构成占比（应发口径）" style={{ ...cardStyle, background: '#fff' }}>
              <Row align="middle">
                <Col span={12}>
                  <div ref={donutRef} style={{ width: '100%', height: 300 }} />
                </Col>
                <Col span={12}>
                  {composition.map((c, idx) => {
                    const pctOfMax = maxComposition > 0 ? Math.round((c.value / maxComposition) * 100) : 0;
                    return (
                      <div key={c.name}
                        style={{ marginBottom: 12, cursor: 'pointer', opacity: selectedDonut === -1 || selectedDonut === idx ? 1 : 0.4 }}
                        onClick={() => toggleDonut(idx)}
                        onMouseEnter={() => setDonutHover(idx)}
                        onMouseLeave={() => setDonutHover(null)}>
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
                            较上月 {c.chg == null ? '—' : `${c.chg >= 0 ? '+' : ''}${c.chg}%`}
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
      <Card title="花名册变动分析" size="small" style={{ ...cardStyle, marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge count={rosterChanges.additions.length} style={{ backgroundColor: '#2e7d5b' }} showZero />
              <span style={{ color: '#2e7d5b', fontWeight: 600, fontSize: 15 }}>新增</span>
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
              <Badge count={rosterChanges.removals.length} style={{ backgroundColor: '#c0392b' }} showZero />
              <span style={{ color: '#c0392b', fontWeight: 600, fontSize: 15 }}>减少</span>
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
      <Card size="small" title="数据统计 Summary" style={cardStyle}>
        <Tabs activeKey={summaryTab} onChange={(k) => { setSummaryTab(k as 'dept' | 'company'); }}
          items={[
            { key: 'company', label: '按公司' },
            { key: 'dept', label: '按部门' },
          ]} />
        <div style={{ overflowX: 'auto' }}>
          <Table
            columns={summaryColumns}
            dataSource={summaryRows}
            loading={loading}
            size="small"
            pagination={false}
            scroll={{ x: 1300 }}
            summary={(pageData) => {
              const rows = pageData as any[];
              const total = (key: string) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={1}><strong>{total('count')}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={2}><strong>{fmtMoney(total('net'))}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={3}><strong>{fmtMoney(total('company_welfare'))}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={4}><strong>{fmtMoney(total('personal_welfare'))}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={5}><strong>{fmtMoney(total('perf_comm'))}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={6}><strong>{fmtMoney(total('attendance_adjust'))}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={7}><strong>{fmtMoney(total('insurance'))}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={8}><strong>{fmtMoney(total('provision'))}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={9}><strong>{fmtMoney(total('total_cost'))}</strong></Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
