import { Button, Card, DatePicker, Input, Modal, Space, Tabs, Tag, Typography, message } from 'antd';
import { DownloadOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { downloadCsv } from '../../shared/lib/csv';
import { formatPhoneNumber } from '../../shared/lib/format';
import { usePermissionStore } from '../../store/usePermissionStore';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';
import { RecordingPlayer } from './RecordingPlayer';
import { ResponsiveTable } from '../../components/ResponsiveTable';

interface RecRow {
  recordingId: string;
  linkedid: string;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: string | null;
  durationSeconds: number;
  recordingStartedAt: string | null;
  session: {
    ani: string;
    dnis?: string | null;
    didNumber?: string | null;
    representativeNumber?: string | null;
    queueName: string;
    queueDisplayName?: string | null;
    primaryAgent: { agentName: string } | null;
  } | null;
}

interface RecordingAuditRow {
  auditLogId: string;
  recordingId: string;
  callId: string | null;
  linkedid: string | null;
  agentId: string | null;
  agentName: string | null;
  agentExtension: string | null;
  userRole: string | null;
  action: string;
  success: boolean;
  createdAt: string;
  userAgent: string | null;
  callerMasked: string | null;
  dnisMasked: string | null;
  clientIpMasked: string | null;
  queueName: string | null;
}

interface RecordingAuditResponse {
  rows: RecordingAuditRow[];
  page: number;
  pageSize: number;
  total: number;
}

function getDisplayDid(row: RecRow) {
  return row.session?.didNumber ?? null;
}

function getRepresentativeDidLines(row: RecRow) {
  const representative = row.session?.representativeNumber?.trim() || null;
  const did = getDisplayDid(row)?.trim() || null;

  if (representative && did && representative !== did) {
    return { primary: formatPhoneNumber(representative), secondary: formatPhoneNumber(did) };
  }

  return {
    primary: formatPhoneNumber(representative ?? did),
    secondary: representative && did && representative === did ? null : did ? formatPhoneNumber(did) : null,
  };
}

function getQueueLabel(row: RecRow) {
  return row.session?.queueDisplayName?.trim() || row.session?.queueName || '-';
}

export function RecordingsPage() {
  const reportPermission = usePermissionStore((state) => state.permissionsByMenu['reports/recordings']);
  const [messageApi, messageContextHolder] = message.useMessage();
  const playerRequestSeq = useRef(0);
  const [rows, setRows]       = useState<RecRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditRows, setAuditRows] = useState<RecordingAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [range, setRange]     = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs().endOf('day')]);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState('recordings');
  const [auditLinkedid, setAuditLinkedid] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(20);
  const [auditTotal, setAuditTotal] = useState(0);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerRow, setPlayerRow] = useState<RecRow | null>(null);
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const replacePlayerUrl = (nextUrl: string | null) => {
    setPlayerUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return nextUrl;
    });
  };

  const closePlayer = () => {
    playerRequestSeq.current += 1;
    setPlayerOpen(false);
    setPlayerRow(null);
    setPlayerLoading(false);
    setPlayerError(null);
    replacePlayerUrl(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/calls/recordings/list', {
        params: {
          from: range[0].toISOString(),
          to:   range[1].toISOString(),
          branchId,
        },
      });
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, range]);

  const loadAudits = useCallback(async (nextPage = auditPage, nextPageSize = auditPageSize) => {
    setAuditLoading(true);
    try {
      const res = await apiClient.get('/admin/reports/recording-download-audits', {
        params: {
          from: range[0].toISOString(),
          to: range[1].toISOString(),
          branchId,
          linkedid: auditLinkedid.trim() || undefined,
          page: nextPage,
          pageSize: nextPageSize,
        },
      });
      const data = (res.data?.data ?? {}) as RecordingAuditResponse;
      setAuditRows(data.rows ?? []);
      setAuditTotal(data.total ?? 0);
      setAuditPage(data.page ?? nextPage);
      setAuditPageSize(data.pageSize ?? nextPageSize);
    } catch {
      setAuditRows([]);
      setAuditTotal(0);
    } finally {
      setAuditLoading(false);
    }
  }, [auditLinkedid, auditPage, auditPageSize, branchId, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportRows = () => {
    downloadCsv(
      `recordings-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['시작', '발신번호', '대표번호', 'DID', '큐', '상담원', '파일명', '형식', '길이(초)'],
      rows.map((row) => [
        row.recordingStartedAt ? dayjs(row.recordingStartedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
        formatPhoneNumber(row.session?.ani),
        formatPhoneNumber(row.session?.representativeNumber ?? row.session?.didNumber),
        formatPhoneNumber(row.session?.didNumber),
        getQueueLabel(row),
        row.session?.primaryAgent?.agentName ?? '-',
        row.fileName,
        row.fileFormat.toUpperCase(),
        row.durationSeconds,
      ]),
    );
  };

  const exportAuditRows = () => {
    downloadCsv(
      `recording-download-audits-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['시각', '상담원', '역할', '고객번호', 'DID', 'IP', 'Linkedid', 'RecordingId', 'User-Agent'],
      auditRows.map((row) => [
        dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        row.agentName ?? row.agentId ?? '',
        row.userRole ?? '',
        row.callerMasked ?? '',
        row.dnisMasked ?? '',
        row.clientIpMasked ?? '',
        row.linkedid ?? '',
        row.recordingId,
        row.userAgent ?? '',
      ]),
    );
  };

  const openPlayer = async (row: RecRow) => {
    const requestSeq = playerRequestSeq.current + 1;
    playerRequestSeq.current = requestSeq;
    setPlayerOpen(true);
    setPlayerRow(row);
    setPlayerLoading(true);
    setPlayerError(null);
    replacePlayerUrl(null);

    try {
      const res = await apiClient.get(`/calls/recordings/${row.recordingId}/stream`, {
        responseType: 'blob',
      });
      const blob = res.data instanceof Blob
        ? res.data
        : new Blob([res.data], { type: res.headers['content-type'] as string | undefined });
      const nextUrl = URL.createObjectURL(blob);
      if (requestSeq !== playerRequestSeq.current) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      replacePlayerUrl(nextUrl);
    } catch {
      if (requestSeq !== playerRequestSeq.current) {
        return;
      }
      setPlayerError('파일을 재생할 수 없습니다.');
      messageApi.error('녹취 파일을 재생할 수 없습니다.');
    } finally {
      if (requestSeq === playerRequestSeq.current) {
        setPlayerLoading(false);
      }
    }
  };

  const downloadRecording = async (row: RecRow) => {
    setDownloadingId(row.recordingId);
    try {
      const res = await apiClient.get(`/calls/recordings/${row.recordingId}/download`, {
        responseType: 'blob',
      });
      const blob = res.data instanceof Blob
        ? res.data
        : new Blob([res.data], { type: res.headers['content-type'] as string | undefined });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = row.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      messageApi.error('녹취 파일을 다운로드할 수 없습니다.');
    } finally {
      setDownloadingId((current) => (current === row.recordingId ? null : current));
    }
  };

  return (
    <Card>
      {messageContextHolder}
      <Typography.Title level={4} style={{ marginTop: 0 }}>녹취 목록</Typography.Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          value={range}
          onChange={(value) => {
            if (!value?.[0] || !value?.[1]) return;
            setRange([value[0].startOf('day'), value[1].endOf('day')]);
          }}
        />
        <BranchFilterSelect value={branchId} onChange={setBranchId} />
        {activeTab === 'audits' ? (
          <Input
            placeholder="Linkedid"
            value={auditLinkedid}
            onChange={(event) => setAuditLinkedid(event.target.value)}
            style={{ width: 180 }}
          />
        ) : null}
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={() => (activeTab === 'audits' ? void loadAudits(1, auditPageSize) : void load())}
          loading={activeTab === 'audits' ? auditLoading : loading}
        >
          조회
        </Button>
        {reportPermission?.canExport && activeTab === 'recordings' ? (
          <Button icon={<DownloadOutlined />} onClick={exportRows} disabled={rows.length === 0}>
            CSV 내보내기
          </Button>
        ) : null}
        {reportPermission?.canExport && activeTab === 'audits' ? (
          <Button icon={<DownloadOutlined />} onClick={exportAuditRows} disabled={auditRows.length === 0}>
            CSV 내보내기
          </Button>
        ) : null}
      </Space>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          if (key === 'audits') void loadAudits(1, auditPageSize);
        }}
        items={[
          {
            key: 'recordings',
            label: '녹취 목록',
            children: (
              <ResponsiveTable<RecRow>
                rowKey="recordingId"
                dataSource={rows}
                loading={loading}
                size="small"
                pagination={{ pageSize: 50 }}
                scroll={{ x: 1250 }}
                columns={[
                  {
                    title: '시작',
                    dataIndex: 'recordingStartedAt',
                    render: (v: string) => (v ? dayjs(v).format('MM-DD HH:mm:ss') : '-'),
                    width: 130,
                  },
                  {
                    title: '발신번호',
                    render: (_: unknown, r: RecRow) => formatPhoneNumber(r.session?.ani),
                    width: 120,
                  },
                  {
                    title: '대표번호 / DID',
                    render: (_: unknown, r: RecRow) => {
                      const lines = getRepresentativeDidLines(r);
                      return (
                        <Space direction="vertical" size={0}>
                          <Typography.Text strong>{lines.primary}</Typography.Text>
                          {lines.secondary ? (
                            <Typography.Text type="secondary">{lines.secondary}</Typography.Text>
                          ) : null}
                        </Space>
                      );
                    },
                    width: 180,
                  },
                  {
                    title: '분배룰',
                    render: (_: unknown, r: RecRow) => getQueueLabel(r),
                    width: 140,
                  },
                  {
                    title: '상담원',
                    render: (_: unknown, r: RecRow) => r.session?.primaryAgent?.agentName ?? '-',
                    width: 100,
                  },
                  { title: '파일명', dataIndex: 'fileName', ellipsis: true },
                  {
                    title: '형식',
                    dataIndex: 'fileFormat',
                    render: (v: string) => <Tag>{v.toUpperCase()}</Tag>,
                    width: 70,
                  },
                  { title: '길이(초)', dataIndex: 'durationSeconds', width: 80 },
                  {
                    title: '관리',
                    key: 'actions',
                    width: 170,
                    fixed: 'right',
                    render: (_: unknown, row: RecRow) => (
                      <Space size="small">
                        <Button
                          icon={<PlayCircleOutlined />}
                          onClick={() => void openPlayer(row)}
                          loading={playerLoading && playerRow?.recordingId === row.recordingId}
                        >
                          재생
                        </Button>
                        {reportPermission?.canExport ? (
                          <Button
                            icon={<DownloadOutlined />}
                            onClick={() => void downloadRecording(row)}
                            loading={downloadingId === row.recordingId}
                          >
                            다운로드
                          </Button>
                        ) : null}
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'audits',
            label: `다운로드 감사 (${auditTotal.toLocaleString()})`,
            children: (
              <ResponsiveTable<RecordingAuditRow>
                rowKey="auditLogId"
                dataSource={auditRows}
                loading={auditLoading}
                size="small"
                pagination={{
                  current: auditPage,
                  pageSize: auditPageSize,
                  total: auditTotal,
                  showSizeChanger: true,
                  onChange: (nextPage, nextPageSize) => void loadAudits(nextPage, nextPageSize),
                }}
                columns={[
                  {
                    title: '시각',
                    dataIndex: 'createdAt',
                    width: 170,
                    render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
                  },
                  {
                    title: '상담원',
                    width: 130,
                    render: (_: unknown, row: RecordingAuditRow) => (
                      <Space direction="vertical" size={0}>
                        <Typography.Text>{row.agentName ?? '-'}</Typography.Text>
                        <Typography.Text type="secondary">{row.agentExtension ?? row.userRole ?? '-'}</Typography.Text>
                      </Space>
                    ),
                  },
                  { title: '고객번호', dataIndex: 'callerMasked', width: 130, render: (value: string | null) => value ?? '-' },
                  { title: 'DID', dataIndex: 'dnisMasked', width: 130, render: (value: string | null) => value ?? '-' },
                  { title: 'IP', dataIndex: 'clientIpMasked', width: 130, render: (value: string | null) => value ?? '-' },
                  { title: 'Linkedid', dataIndex: 'linkedid', width: 150, render: (value: string | null) => value ?? '-' },
                  { title: '녹취ID', dataIndex: 'recordingId', width: 260, ellipsis: true },
                  { title: 'User-Agent', dataIndex: 'userAgent', ellipsis: true, render: (value: string | null) => value ?? '-' },
                ]}
              />
            ),
          },
        ]}
      />
      <Modal
        title="녹취 재생"
        open={playerOpen}
        onCancel={closePlayer}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Typography.Text strong>{playerRow?.fileName ?? '-'}</Typography.Text>
            <Typography.Text type="secondary">
              발신번호 {formatPhoneNumber(playerRow?.session?.ani)} / 상담원 {playerRow?.session?.primaryAgent?.agentName ?? '-'}
            </Typography.Text>
          </Space>
          {playerLoading ? <Typography.Text type="secondary">녹취 파일을 불러오는 중입니다.</Typography.Text> : null}
          {playerError ? <Typography.Text type="danger">{playerError}</Typography.Text> : null}
          {!playerLoading && !playerError && playerUrl ? (
            <RecordingPlayer src={playerUrl} autoPlay />
          ) : null}
        </Space>
      </Modal>
    </Card>
  );
}
