import * as XLSX from 'xlsx';

/**
 * 通用导入导出工具
 *
 * 每个模块定义自己的表头定义（ExportDef），然后调用
 *   - exportXlsx(def, data, filename)
 *   - importXlsx(def, file): Promise<{data, errors}>
 *
 * 表头定义：
 *   - label:  导出的列名（表头文字）
 *   - key:    数据字段名
 *   - hidden: 可选，true 表示导出时不导出（如唯一值设为 false 即可导出）
 */

export interface ColumnDef {
  key: string;         // 数据字段名
  label: string;       // 表头文字
  hidden?: boolean;    // true = 导出时不导出
  required?: boolean;  // true = 导入时必填
}

export interface ExportDef {
  module: string;        // 模块名，如 '员工花名册'
  columns: ColumnDef[];
}

/**
 * 导出为 XLSX 并触发浏览器下载。
 * @param def    表头定义
 * @param data   数据数组
 * @param period 月份（如 2026-08），会自动拼进文件名
 */
export function exportXlsx(def: ExportDef, data: any[], period?: string) {
  const visibleColumns = def.columns.filter(c => !c.hidden);

  // 列标题行
  const headerRow = visibleColumns.map(c => c.label);

  // 数据行
  const rows = data.map(row =>
    visibleColumns.map(c => {
      const val = row[c.key];
      return val !== undefined && val !== null ? val : '';
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.module);

  const suffix = period ? `_${period}` : '';
  const filename = `${def.module}${suffix}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * 导入 XLSX 文件，返回解析后的数据。
 * 自动匹配表头文字 → key。
 *
 * @param def   表头定义
 * @param file  File 对象
 * @returns     { data: Record<string, any>[], import_errors: string[] }
 */
export function importXlsx(def: ExportDef, file: File): Promise<{
  data: Record<string, any>[];
  import_errors: string[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rows.length < 2) {
          resolve({ data: [], import_errors: [] });
          return;
        }

        // 第一行是表头，建立 label → key 映射
        const headerRow = rows[0] as string[];
        const labelToKey: Record<string, string> = {};
        const labelToRequired: Record<string, boolean> = {};

        for (const col of def.columns) {
          if (col.hidden) continue;
          labelToKey[col.label] = col.key;
          labelToRequired[col.label] = col.required || false;
        }

        const data: Record<string, any>[] = [];
        const import_errors: string[] = [];

        // 跳过标题行（行 2+）
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every(cell => cell === undefined || cell === null || cell === '')) continue;

          const record: Record<string, any> = {};
          for (let j = 0; j < headerRow.length; j++) {
            const label = (headerRow[j] || '').toString().trim();
            const key = labelToKey[label];
            if (key) {
              const val = row[j];
              record[key] = val !== undefined && val !== null && val !== '' ? val : undefined;
            }
          }

          // 校验必填
          for (let j = 0; j < headerRow.length; j++) {
            const label = (headerRow[j] || '').toString().trim();
            if (labelToRequired[label]) {
              const key = labelToKey[label];
              if (record[key] === undefined || record[key] === null || record[key] === '') {
                import_errors.push(`第 ${i + 1} 行 "${label}" 为空`);
              }
            }
          }

          if (Object.keys(record).length > 0) {
            data.push(record);
          }
        }

        resolve({ data, import_errors });
      } catch (err: any) {
        reject(new Error(`解析文件失败: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsBinaryString(file);
  });
}
