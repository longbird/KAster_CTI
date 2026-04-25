import { Button, DatePicker, Select, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { downloadCsv } from '../../shared/lib/csv';
import { formatPhoneNumber } from '../../shared/lib/format';
import { usePermissionStore } from '../../store/usePermissionStore';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';
import { AdmPageHead } from '../../shared/ui/AdmPageHead';

interface CdrRow {
  callId: string;
  linkedid: string;
  ani: string;
  dnis: string;
  didNumber?: string | null;
  representativeNumber?: string | null;
  queueName: string;
  queueDisplayName?: string | null;
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
  NEW: 'cyan',
  TRANSFERRING: 'cyan',
};

const STATUS_LABEL: Record<string, string> = {
  NEW: '인입 중',
  QUEUED: '대기열',
  RINGING_AGENT: '벨 울림',
  TALKING: '통화 중',
  AFTER_CALL_WORK: '후처리',
  TRANSFERRING: '전환 중',
  ENDED: '종료',
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

const TRANSFER_PHASE_LABEL: Record<string, string> = {
  REQUESTED: '요청됨',
  CONSULT_RINGING: '협의 호출',
  CONSULT_TALKING: '협의 통화',
  REBRIDGING: '재연결 중',
  COMPLETED: '완료',
  FAILED: '실패',
  EXPIRED: '만료',
};

function getStatusLabel(value?: string | null) {
  if (!value) return '-';
  return STATUS_LABEL[value] ?? '알 수 없음';
}

function getTransferPhaseLabel(value?: string | null) {
  if (!value) return '-';
  return TRANSFER_PHASE_LABEL[value] ?? '알 수 없음';
}

function getDisplayDid(row: CdrRow) {
  return row.didNumber ?? null;
}

function getRepresentativeDidLines(row: CdrRow) {
  const representative = row.representativeNumber?.trim() || null;
  const did = getDisplayDid(row)?.trim() || null;

  if (representative && did && representative !== did) {
    return { primary: formatPhoneNumber(representative), secondary: formatPhoneNumber(did) };
  }

  return {
    primary: formatPhoneNumber(representative ?? did),
    secondary: representative && did && representative === did ? null : did ? formatPhoneNumber(did) : null,
  };
}

function getQueueLabel(row: CdrRow) {
  return row.queueDisplayName?.trim() || row.queueName || '-';
}

export function CallsReportPage() {
  const reportPermission = usePermissionStore((state) => state.permissionsByMenu['reports/calls']);
  const [rows, setRows]       = useState<CdrRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange]     = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs().endOf('day')]);
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
      ['시작', '발신번호', '대표번호', 'DID', '큐', '상담원', '상태', '전환', '대기(초)', '통화(초)', '포기', '녹취'],
      rows.map((row) => [
        dayjs(row.startedAt).format('YYYY-MM-DD HH:mm:ss'),
        formatPhoneNumber(row.ani),
        formatPhoneNumber(row.representativeNumber ?? row.didNumber),
        formatPhoneNumber(row.didNumber),
        getQueueLabel(row),
        row.primaryAgent?.agentName ?? '-',
        getStatusLabel(row.sessionStatus),
        row.latestTransfer
          ? `${getTransferPhaseLabel(row.latestTransfer.phase)}${row.latestTransfer.toExtension ? ` · ${row.latestTransfer.toExtension}` : ''}`
          : '-',
        row.waitSeconds,
        row.talkSeconds,
        row.abandonFlag ? 'Y' : 'N',
        row.recordingFlag ? 'Y' : 'N',
      ]),
    );
  };

  return (
    <>
      <AdmPageHead
        title="리포트 · 통화내역"
        sub={`CDR 조회 · ${rows.length.toLocaleString()}건`}
      />
      <section className="adm-card" style={{ padding: 14 }}>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          value={range}
          onChange={(value) => {
            if (!value?.[0] || !value?.[1]) return;
            setRange([value[0].startOf('day'), value[1].endOf('day')]);
          }}
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
          { title: '발신번호', dataIndex: 'ani', width: 120, render: (value: string) => formatPhoneNumber(value) },
          {
            title: '대표번호 / DID',
            width: 180,
            render: (_: unknown, row: CdrRow) => {
              const lines = getRepresentativeDidLines(row);
              return (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{lines.primary}</Typography.Text>
                  {lines.secondary ? (
                    <Typography.Text type="secondary">{lines.secondary}</Typography.Text>
                  ) : null}
                </Space>
              );
            },
          },
          {
            title: '분배룰',
            width: 140,
            render: (_: unknown, row: CdrRow) => getQueueLabel(row),
          },
          {
            title: '상담원',
            render: (_: unknown, r: CdrRow) => r.primaryAgent?.agentName ?? '-',
            width: 100,
          },
          {
            title: '상태',
            dataIndex: 'sessionStatus',
            render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'}>{getStatusLabel(v)}</Tag>,
            width: 120,
          },
          {
            title: '전환',
            width: 150,
            render: (_: unknown, r: CdrRow) =>
              r.latestTransfer ? (
                <Tag color={TRANSFER_PHASE_COLOR[r.latestTransfer.phase] ?? 'default'}>
                  {getTransferPhaseLabel(r.latestTransfer.phase)}
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
      </section>
    </>
  );
}
