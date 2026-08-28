import React, { useEffect, useState } from 'react';
import { Modal, Button, Upload, Space, Table, message, Empty, Typography } from 'antd';
import { UploadOutlined, DownloadOutlined, FileExcelOutlined, ReloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { uploadRawExcel, listRawExcel, getRawExcelUrl, type RawModule } from '../utils/rawExcel';
import { canSubmit } from '../utils/permissions';
import { useStore } from '../stores/appStore';

interface RawExcelModalProps {
  open: boolean;
  module: RawModule;
  moduleLabel: string;  // 如 '薪资计算' / '考勤管理'
  onClose: () => void;
}

interface RowDef {
  key: string;
  name: string;
}

/** 用 xlsx 解析文件内容，取第一个 sheet 前 50 行 */
function parsePreview(file: File): Promise<{ columns: any[]; rows: { key: number; cells: any[] }[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
        const head = (rows[0] as any[]) || [];
        const dataRows = rows.slice(1, 51).map((r: any, i: number) => ({ key: i, cells: (r as any[]) || [] }));
        const columns = head.map((h: any, i: number) => ({
          title: String(h !== undefined && h !== null ? h : `列${i + 1}`),
          dataIndex: 'cells',
          key: i,
          render: (cells: any[]) => cells?.[i] ?? '',
          width: 120,
          ellipsis: true,
        }));
        resolve({ columns, rows: dataRows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsBinaryString(file);
  });
}

const RawExcelModal: React.FC<RawExcelModalProps> = ({ open, module, moduleLabel, onClose }) => {
  const period = useStore(s => s.currentPeriod);
  const [fileList, setFileList] = useState<RowDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 预览状态
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewColumns, setPreviewColumns] = useState<any[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  const canUpload = canSubmit(module); // 仅人事专员可上传（管理员不参与）

  const loadList = async () => {
    setLoading(true);
    try {
      const lst = await listRawExcel(module, period);
      setFileList(lst.map(f => ({ key: f.id || f.name, name: f.name })));
    } catch {
      setFileList([]);
    }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) { loadList(); } }, [open, period, module]);

  const handleUpload = async (file: File) => {
    if (!canUpload) { message.warning('仅人事专员可上传原始表格'); return false; }
    setUploading(true);
    try {
      await uploadRawExcel(module, period, file.name, file);
      message.success('上传成功');
      await loadList();
    } catch (e: any) {
      message.error(e?.message || '上传失败');
    } finally {
      setUploading(false);
    }
    return false; // 阻止 antd 默认上传
  };

  // 下载（浏览器直接下载）
  const handleDownload = (name: string) => {
    const url = getRawExcelUrl(module, period, name);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.target = '_blank';
    a.click();
  };

  // 预览：下载文件并用 xlsx 解析成表格
  const handlePreview = async (name: string) => {
    try {
      setPreviewTitle(name);
      const url = getRawExcelUrl(module, period, name);
      const res = await fetch(url);
      if (!res.ok) throw new Error('文件获取失败');
      const blob = await res.blob();
      const file = new File([blob], name, { type: blob.type });
      const { columns, rows } = await parsePreview(file);
      setPreviewColumns(columns);
      setPreviewRows(rows);
      setPreviewOpen(true);
    } catch (e: any) {
      message.error(e?.message || '预览失败');
    }
  };

  return (
    <>
      <Modal
        title={`${moduleLabel} · 原始表格（${period}）`}
        open={open}
        onCancel={onClose}
        footer={null}
        width={760}
      >
        <Space style={{ marginBottom: 12 }}>
          {canUpload && (
            <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(f) => { handleUpload(f); return false; }}>
              <Button type="primary" icon={<UploadOutlined />} loading={uploading}>上传原始表格</Button>
            </Upload>
          )}
          <Button icon={<ReloadOutlined />} onClick={loadList} loading={loading}>刷新</Button>
          {!canUpload && <Typography.Text type="secondary">上传仅限人事专员，你可下载/预览</Typography.Text>}
        </Space>

        {fileList.length === 0 ? (
          <Empty description={`${period} 暂无原始表格文件`} />
        ) : (
          <Table
            size="small"
            rowKey="key"
            columns={[
              { title: '文件名', dataIndex: 'name', key: 'name', ellipsis: true },
              {
                title: '操作', key: 'act', width: 160,
                render: (_: any, r: RowDef) => (
                  <Space size={4}>
                    <Button size="small" icon={<FileExcelOutlined />} onClick={() => handlePreview(r.name)}>预览</Button>
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(r.name)}>下载</Button>
                  </Space>
                ),
              },
            ]}
            dataSource={fileList}
            loading={loading}
            pagination={false}
          />
        )}
      </Modal>

      {/* 预览弹窗 */}
      <Modal
        title={`预览 · ${previewTitle}`}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={900}
      >
        {previewRows.length === 0 ? (
          <Empty description="表格内容为空" />
        ) : (
          <div style={{ maxHeight: 520, overflow: 'auto' }}>
            <Table
              size="small"
              rowKey="key"
              columns={previewColumns}
              dataSource={previewRows}
              pagination={false}
              scroll={{ x: true }}
            />
          </div>
        )}
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          预览最多展示前 50 行，完整数据请下载后用 Excel 打开。
        </Typography.Text>
      </Modal>
    </>
  );
};

export default RawExcelModal;
