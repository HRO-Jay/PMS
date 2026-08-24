/**
 * 数据统计 Summary 导出 PDF
 * 生成一个 PDF 文件，包含两页：按公司汇总 + 按部门汇总
 * 中文通过内嵌 Noto Sans CJK SC 子集字体解决乱码问题
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface SummaryRow {
  group: string;          // 发薪公司 / 成本中心 / 部门
  count: number;          // 人数
  net: number;            // 实收工资
  company_welfare: number;
  personal_welfare: number;
  perf_comm: number;
  attendance_adjust: number;
  insurance: number;
  provision: number;
  total_cost: number;
}

const money = (v: number): string => {
  if (v === undefined || v === null || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 中文字体（Noto Sans CJK SC 子集），放在 public 目录下
const FONT_URL = `${import.meta.env.BASE_URL}NotoSansSC-subset.ttf`;

let fontBase64: string | null = null;
let fontLoading: Promise<string> | null = null;

async function loadChineseFont(): Promise<string> {
  if (fontBase64) return fontBase64;
  if (!fontLoading) {
    fontLoading = (async () => {
      const resp = await fetch(FONT_URL);
      if (!resp.ok) throw new Error(`字体加载失败: ${resp.status}`);
      const buf = await resp.arrayBuffer();
      // 转 base64
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      fontBase64 = btoa(binary);
      return fontBase64!;
    })();
  }
  return fontLoading;
}

function buildTable(doc: jsPDF, title: string, subtitle: string, groupLabel: string, rows: SummaryRow[], startY: number) {
  // 标题
  doc.setFont('NotoSansSC', 'normal');
  doc.setFontSize(16);
  doc.text(title, 14, startY);

  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(subtitle, 14, startY + 6);
  doc.setTextColor(0, 0, 0);

  const columns = [
    groupLabel, '人数', '实收工资', '公司福利', '个人福利',
    '绩效&佣金', '考勤调整', '商保金额', '预提福利费', '人力成本总计',
  ];

  const body = rows.map(r => [
    r.group,
    r.count || 0,
    money(r.net),
    money(r.company_welfare),
    money(r.personal_welfare),
    money(r.perf_comm),
    money(r.attendance_adjust),
    money(r.insurance),
    money(r.provision),
    money(r.total_cost),
  ]);

  // 合计行
  const sum = (key: keyof SummaryRow) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  const totalRow = [
    '合计',
    sum('count'),
    money(sum('net')),
    money(sum('company_welfare')),
    money(sum('personal_welfare')),
    money(sum('perf_comm')),
    money(sum('attendance_adjust')),
    money(sum('insurance')),
    money(sum('provision')),
    money(sum('total_cost')),
  ];

  autoTable(doc, {
    head: [columns],
    body: [...body, totalRow],
    startY: startY + 10,
    styles: { font: 'NotoSansSC', fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 7, halign: 'center', font: 'NotoSansSC' },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
    },
    // 最后一行为合计行，加粗
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [245, 247, 250];
      }
    },
    margin: { left: 10, right: 10 },
  });
}

export async function exportSummaryPdf(companyRows: SummaryRow[], deptRows: SummaryRow[], period: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // 注册中文字体
  const fontB64 = await loadChineseFont();
  doc.addFileToVFS('NotoSansSC-subset.ttf', fontB64);
  doc.addFont('NotoSansSC-subset.ttf', 'NotoSansSC', 'normal');

  const subtitle = `数据期间：${period}　·　金额单位：元`;

  // 第一页：按公司
  buildTable(doc, '数据统计 Summary — 按公司', subtitle, '发薪公司', companyRows, 15);

  // 第二页：按部门
  doc.addPage();
  buildTable(doc, '数据统计 Summary — 按部门', subtitle, '成本中心/部门', deptRows, 15);

  doc.save(`数据统计Summary_${period}.pdf`);
}
