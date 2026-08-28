/**
 * 原始表格（原始 Excel）上传/下载/预览 — 基于 Supabase Storage
 *
 * bucket: excel-raw
 * 存储路径：{module}/{period}/{filename}
 *   其中 module: 'payroll'（薪资计算）| 'attendance'（考勤管理）
 *   period: 'YYYY-MM'
 */
const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dWxkbnl3bWlmbGJtbWxnbWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzY0NDgsImV4cCI6MjEwMTkxMjQ0OH0.8qqzH3zMc274Di-TK_6huMhrOWppJI1L3tjIfcBV2ts';

export type RawModule = 'payroll' | 'attendance';

const bucket = 'excel-raw';

/** 得到登录 token（上传时需要认证） */
function getToken(): string | null {
  return localStorage.getItem('supabase_token');
}

/** 构建文件在 storage 中的完整路径 */
function objectPath(module: RawModule, period: string, filename: string): string {
  return `${module}/${period}/${filename}`;
}

/**
 * 上传原始 Excel。
 * 上传需登录（认证用户），权限由 storage RLS 控制（人事专员/管理员可写）。
 */
export async function uploadRawExcel(
  module: RawModule,
  period: string,
  filename: string,
  file: File
): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('未登录，无法上传');
  const path = objectPath(module, period, filename);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`上传失败：${t || res.status}`);
  }
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
