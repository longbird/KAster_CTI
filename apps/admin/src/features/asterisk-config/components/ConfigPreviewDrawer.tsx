import { Alert, Drawer, Space, Spin, Table, Tabs, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { getDryRun } from '../api/asteriskConfigApi';
import type { ConfDiffSummary, ConfDryRun, ConfValidationCheck } from '../types/asterisk-config';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ConfigPreviewDrawer({ open, onClose }: Props) {
  const [dryRun, setDryRun] = useState<ConfDryRun | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getDryRun()
      .then(setDryRun)
      .catch(() => setDryRun(null))
      .finally(() => setLoading(false));
  }, [open]);

  const preview = dryRun?.files;
  const items = preview
    ? [
        {
          key: 'summary',
          label: '검증 요약',
          children: (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Alert
                type={dryRun.validation.ok ? 'success' : 'error'}
                showIcon
                message={dryRun.validation.ok ? 'Dry-run 검증 통과' : 'Dry-run 검증 실패'}
                description={`생성 시각: ${dryRun.generatedAt}`}
              />
              <Typography.Text strong>변경 파일</Typography.Text>
              <Table<ConfDiffSummary>
                size="small"
                pagination={false}
                rowKey="fileName"
                dataSource={dryRun.diff}
                columns={[
                  { title: '파일', dataIndex: 'fileName' },
                  {
                    title: '상태',
                    dataIndex: 'status',
                    render: (status: ConfDiffSummary['status']) => (
                      <Tag color={status === 'changed' ? 'orange' : status === 'missing-current' ? 'blue' : 'green'}>
                        {status}
                      </Tag>
                    ),
                  },
                  { title: '+', dataIndex: 'addedLines', width: 70 },
                  { title: '-', dataIndex: 'removedLines', width: 70 },
                ]}
              />
              <Typography.Text strong>검증 항목</Typography.Text>
              <Table<ConfValidationCheck>
                size="small"
                pagination={false}
                rowKey="name"
                dataSource={dryRun.validation.checks}
                columns={[
                  { title: '항목', dataIndex: 'name' },
                  {
                    title: '결과',
                    dataIndex: 'status',
                    width: 90,
                    render: (status: ConfValidationCheck['status']) => (
                      <Tag color={status === 'pass' ? 'green' : 'red'}>{status}</Tag>
                    ),
                  },
                  { title: '내용', dataIndex: 'detail' },
                ]}
              />
              <Typography.Text strong>적용 시 reload 명령</Typography.Text>
              <SyntaxHighlighter language="bash" style={vs}>{dryRun.reloadCommands.join('\n')}</SyntaxHighlighter>
            </Space>
          ),
        },
        { key: 'pjsip', label: 'pjsip.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.pjsip}</SyntaxHighlighter> },
        { key: 'inbound', label: 'extensions_inbound.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.extensionsInbound}</SyntaxHighlighter> },
        { key: 'queue', label: 'extensions_queue.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.extensionsQueue}</SyntaxHighlighter> },
        { key: 'agent', label: 'extensions_agent.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.extensionsAgent}</SyntaxHighlighter> },
        { key: 'queues', label: 'queues.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.queues}</SyntaxHighlighter> },
      ]
    : [];

  return (
    <Drawer title=".conf 미리보기 / dry-run" open={open} onClose={onClose} width={900}>
      <Spin spinning={loading}>
        {preview && <Tabs items={items} />}
        {!loading && !preview && <span style={{ color: '#888' }}>dry-run 결과를 불러올 수 없습니다</span>}
      </Spin>
    </Drawer>
  );
}
