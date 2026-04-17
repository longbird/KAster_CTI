import { Button, Card, DatePicker, Select, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { downloadCsv } from '../../shared/lib/csv';
import { usePermissionStore } from '../../store/usePermissionStore';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';

interface CdrRow {
  callId: string;
  linkedid: string;
  ani: string;
  dnis: string;
  queueName: string;
  sessionStatus: string;
  direction: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  waitSeconds: number;
  talkSeconds: number;
  abandonFlag: boolean;
  recordingFlag: boolean;
  primaryAgent: { agentName: string } | null;
  latestTransfer?: {
    phase: string;
    toExtension?: string | null;
  } | null;
}

const STATUS_COLOR: Record<string, string> = {
  ENDED: 'default',
  QUEUED: 'orange',
  TALKING: 'blue',
  AFTER_CALL_WORK: 'purple',
  RINGING_AGENT: 'gold',
};

const TRANSFER_PHASE_COLOR: Record<string, string> = {
  REQUESTED: 'default',
  CONSULT_RINGING: 'gold',
  CONSULT_TALKING: 'blue',
  REBRIDGING: 'cyan',
  COMPLETED: 'green',
  FAILED: 'red',
  EXPIRED: 'orange',
};

export function CallsReportPage() {
  const reportPermission = usePermissionStore((state) => state.permissionsByMenu['reports/calls']);
  const [rows, setRows]       = useState<CdrRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange]     = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs()]);
  const [mode, setMode]       = useState<'all' | 'missed'>('all');
  const [branchId, setBranchId] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/calls/history', {
        params: {
          from: range[0].toISOString(),
          to:   range[1].toISOString(),
          mode: mode === 'missed' ? 'missed' : undefined,
          branchId,
        },
      });
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const exportRows = () => {
    downloadCsv(
      `calls-report-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['시작', '발신번호', '수신번호', '큐', '상담원', '상태', '전환', '대기(초)', '통화(초)', '포기', '녹취'],
      rows.map((row) => [
        dayjs(row.startedAt).format('YYYY-MM-DD HH:mm:ss'),
        row.ani,
        row.dnis,
        row.queueName,
        row.primaryAgent?.agentName ?? '-',
        row.sessionStatus,
        row.latestTransfer
          ? `${row.latestTransfer.phase}${row.latestTransfer.toExtension ? ` · ${row.latestTransfer.toExtension}` : ''}`
          : '-',
        row.waitSeconds,
        row.talkSeconds,
        row.abandonFlag ? 'Y' : 'N',
        row.recordingFlag ? 'Y' : 'N',
      ]),
    );
  };

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>통화내역 조회</Typography.Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          showTime
          value={range}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
        />
        <BranchFilterSelect value={branchId} onChange={setBranchId} />
        <Select
          value={mode}
          onChange={setMode}
          options={[
            { value: 'all',    label: '전체' },
            { value: 'missed', label: '미연결만' },
          ]}
          style={{ width: 120 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => void load()} loading={loading}>
          조회
        </Button>
        {reportPermission?.canExport ? (
          <Button icon={<DownloadOutlined />} onClick={exportRows} disabled={rows.length === 0}>
            CSV 내보내기
          </Button>
        ) : null}
      </Space>
      <Table<CdrRow>
        rowKey="callId"
        dataSource={rows}
        loading={loading}
        size="small"
        pagination={{ pageSize: 50 }}
        columns={[
          {
            title: '시작',
            dataIndex: 'startedAt',
            render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss'),
            width: 130,
          },
          { title: '발신번호', dataIndex: 'ani', width: 120 },
          { title: '수신번호', dataIndex: 'dnis', width: 120 },
          { title: '큐', dataIndex: 'queueName', width: 120 },
          {
            title: '상담원',
            render: (_: unknown, r: CdrRow) => r.primaryAgent?.agentName ?? '-',
            width: 100,
          },
          {
            title: '상태',
            dataIndex: 'sessionStatus',
            render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'}>{v}</Tag>,
            width: 120,
          },
          {
            title: '전환',
            width: 150,
            render: (_: unknown, r: CdrRow) =>
              r.latestTransfer ? (
                <Tag color={TRANSFER_PHASE_COLOR[r.latestTransfer.phase] ?? 'default'}>
                  {r.latestTransfer.phase}
                  {r.latestTransfer.toExtension ? ` · ${r.latestTransfer.toExtension}` : ''}
                </Tag>
              ) : (
                '-'
              ),
          },
          { title: '대기(초)', dataIndex: 'waitSeconds', width: 80 },
          { title: '통화(초)', dataIndex: 'talkSeconds', width: 80 },
          {
            title: '포기',
            dataIndex: 'abandonFlag',
            render: (v: boolean) => (v ? <Tag color="red">포기</Tag> : '-'),
            width: 60,
          },
          {
            title: '녹취',
            dataIndex: 'recordingFlag',
            render: (v: boolean) => (v ? <Tag color="blue">Y</Tag> : '-'),
            width: 60,
          },
        ]}
      />
    </Card>
  );
}
