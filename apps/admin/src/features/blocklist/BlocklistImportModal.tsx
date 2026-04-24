import { InboxOutlined } from '@ant-design/icons';
import { Alert, Modal, Typography, Upload, message } from 'antd';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import type { ImportBlocklistEntryRow } from '../asterisk-config/types/asterisk-config';

export type { ImportBlocklistEntryRow };

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ImportBlocklistEntryRow[]) => Promise<void>;
}

export function parseBlocklistImportTextRows(text: string): ImportBlocklistEntryRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const [headerLine, ...dataLines] = lines;
  const headers = headerLine.split(',').map((item) => item.trim());
  return dataLines.map((line) => {
    const values = line.split(',');
    return headers.reduce((acc, header, index) => {
      if (header === '전화번호' || header === '사유') {
        acc[header] = values[index]?.trim() ?? '';
      }
      return acc;
    }, {} as ImportBlocklistEntryRow);
  });
}

async function parseFile(file: File): Promise<ImportBlocklistEntryRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<ImportBlocklistEntryRow>(sheet, { defval: '' });
  }

  return parseBlocklistImportTextRows(await file.text());
}

export function BlocklistImportModal({ open, onClose, onImport }: Props) {
  const [rows, setRows] = useState<ImportBlocklistEntryRow[]>([]);
  const [fileName, setFileName] = useState('');

  return (
    <Modal
      open={open}
      title="블랙리스트 파일 가져오기"
      okText="가져오기"
      cancelText="닫기"
      onCancel={onClose}
      onOk={async () => {
        await onImport(rows);
      }}
    >
      <Alert
        type="info"
        showIcon
        message="xlsx, csv, txt(쉼표 구분) 템플릿만 지원합니다."
        description="필수 컬럼: 전화번호 / 선택 컬럼: 사유"
        style={{ marginBottom: 16 }}
      />
      <Upload.Dragger
        accept=".xlsx,.csv,.txt"
        beforeUpload={async (file) => {
          try {
            const parsedRows = await parseFile(file);
            setRows(parsedRows);
            setFileName(file.name);
            message.success(`${file.name} 파일을 읽었습니다.`);
          } catch {
            message.error('파일을 읽지 못했습니다.');
          }
          return false;
        }}
        maxCount={1}
        showUploadList={false}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">파일을 드래그하거나 클릭해 선택하세요</p>
      </Upload.Dragger>
      <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
        선택 파일: {fileName || '-'} / 읽은 행 수: {rows.length}
      </Typography.Paragraph>
    </Modal>
  );
}
