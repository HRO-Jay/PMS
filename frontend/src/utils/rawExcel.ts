/**
 * 原始表格（原始 Excel）上传/下载/预览 — 基于 Supabase Storage
 *
 * bucket: excel-raw
 * 存储路径：{module}/{period}/{safeFilename}
 *   其中 module: 'payroll'（薪资计算）| 'attendance'（考勤管理）
 *   period: 'YYYY-MM'
 *
 * 注意：Supabase Storage 的对象 key 不允许中文，存储文件名统一转成安全的英文/数字形式：
 *   {module}_{period}_{时间戳}.xlsx  例如  attendance_2026-06_1724846400000.xlsx
 */
const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dWxkbnl3bWlmbGJtbWxnbWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzY0NDgsImV4cCI6MjEwMTkxMjQ0OH0.8qqzH3zMc274Di-TK_6huMhrOWppJI1L3tjIfcBV2ts';

export type RawModule = 'payroll' | 'attendance';

const bucket = 'excel-raw';

/** 得到登录 token（上传时需要认证） */
function getToken(): string | null {
  return localStorage.getItem('supabase_token');
}

/**
 * 把原始文件名转成安全的存储文件名（不含中文/特殊字符）。
 * 保留下扩展名，主名用 模块_月份_时间戳。
 */
function toSafeFilename(module: RawModule, period: string, originalName: string): string {
  const extMatch = originalName.match(/\.(xlsx|xls)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'xlsx';
  const ts = Date.now();
  return `${module}_${period}_${ts}.${ext}`;
}

/** 构建文件在 storage 中的完整路径 */
function objectPath(module: RawModule, period: string, filename: string): string {
  return `${module}/${period}/${filename}`;
}

/**
 * 上传原始 Excel。
 * 上传需登录（认证用户），权限由 storage RLS 控制（人事专员/管理员可写）。
 * 返回实际存储的文件名（安全化后的）。
 */
export async function uploadRawExcel(
  module: RawModule,
  period: string,
  originalName: string,
  file: File
): Promise<string> {
  const token = getToken();
  if (!token) throw new Error('未登录，无法上传');
  const safeName = toSafeFilename(module, period, originalName);
  const path = objectPath(module, period, safeName);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`上传失败：${t || res.status}`);
  }
  return safeName;
}

/** 取公开下载 URL（所有人都能下载，无需登录） */
export function getRawExcelUrl(module: RawModule, period: string, filename: string): string {
  const path = objectPath(module, period, filename);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * 列出指定模块 + 月份的原始文件。
 * 需要认证读取 storage 列表（登录即可读，RLS 允许所有认证用户）。
 */
export async function listRawExcel(module: RawModule, period: string): Promise<{ name: string; id: string }[]> {
  const token = getToken();
  const headers: Record<string, string> = { apikey: ANON_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prefix: `${module}/${period}/` }),
  });
  if (!res.ok) throw new Error('列表获取失败');
  const data = await res.json();
  return (data || []).map((o: any) => ({ name: o.name, id: o.id }));
}
