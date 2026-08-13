/**
 * 唯一值生成 — 姓名 + 发薪公司全称 的 SHA256 前 16 位十六进制。
 * 与数据库迁移 SQL 中的 digest(name || '|' || company_full_name, 'sha256') 保持一致。
 */

export async function genUniqueHash(name: string, companyFullName: string): Promise<string> {
  const text = `${name}|${companyFullName}`;
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // 取前 8 字节 = 16 位十六进制
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 同步版本（用于非 async 场景，纯 JS 实现 SHA-256） */
export function genUniqueHashSync(name: string, companyFullName: string): string {
  // 用简单可复现的哈希：FNV-1a 两次 + 固定 salt，生成 16 位 hex
  // 注意：此算法与后端 digest(sha256) 不一致，仅作为兜底。
  // 正式逻辑请优先用 genUniqueHash（Web Crypto SHA-256）。
  const text = `${name}|${companyFullName}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
}
