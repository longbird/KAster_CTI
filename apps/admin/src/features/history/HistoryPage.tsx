import { Button, DatePicker, Input, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { downloadCsv } from '../../shared/lib/csv';
import { AdmPageHead } from '../../shared/ui/AdmPageHead';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';
import { usePermissionStore } from '../../store/usePermissionStore';
import { ResponsiveTable } from '../../components/ResponsiveTable';
import { CallAnalysisDrawer } from '../call-analysis/CallAnalysisDrawer';

interface HistoryRow {
  callId: string;
  ani: string;
  dnis: string;
  didNumber?: string | null;
  representativeNumber?: string | null;
  queueName: string;
  sessionStatus: string;
  direction: string;
  startedAt: string;
  endedAt: string | null;
  talkSeconds: number;
  waitSeconds: number;
  abandonFlag: boolean;
  recordingFlag: boolean;
  primaryAgent?: { agentName: string } | null;
}

const RESULT_META: Record<string, { label: string; color: string }> = {
  ENDED:            { label: '완료',    color: 'var(--fg-2)' },
  AFTER_CALL_WORK:  { label: '후처리',  color: 'var(--status-acw)' },
  TALKING:          { label: '진행중',  color: 'var(--status-talking)' },
  QUEUED:           { label: '대기',    color: 'var(--accent-warn)' },
  RINGING_AGENT:    { label: '벨울림',  color: 'var(--status-ringing)' },
};

function fmtDur(sec: number) {
  if (!sec) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function HistoryPage() {
  const permission = usePermissionStore((s) => s.permissionsByMenu['history']);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(1, 'day'), dayjs()]);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [analysisCallId, setAnalysisCallId] = useState<string | null>(null);
  const analysisEnabled = usePermissionStore((s) => s.featureEntitlements['call-analysis'] ?? false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/calls/history', {
        params: {
          from: range[0].toISOString(),
          to: range[1].toISOString(),
          branchId,
          keyword: keyword || undefined,
        },
      });
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportRows = () => {
    if (!rows) return;
    downloadCsv(
      `call-history-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['시작', '발신번호', '대표번호/DID', '큐', '상담원', '결과', '통화시간(초)', '녹취'],
      rows.map((r) => [
        dayjs(r.startedAt).format('YYYY-MM-DD HH:mm:ss'),
        r.ani,
        r.representativeNumber ?? r.didNumber ?? r.dnis,
        r.queueName,
        r.primaryAgent?.agentName ?? '-',
        r.sessionStatus,
        r.talkSeconds,
        r.recordingFlag ? 'Y' : 'N',
      ]),
    );
  };

  if (!rows && loading) return <Skeleton active paragraph={{ rows: 10 }} />;

  return (
    <>
      <AdmPageHead
        title="통화 이력"
        sub={`${range[0].format('MM-DD HH:mm')} ~ ${range[1].format('MM-DD HH:mm')} · ${rows?.length ?? 0}건`}
        right={
          permission?.canExport ? (
            <Button icon={<DownloadOutlined />} onClick={exportRows} disabled={!rows?.length} className="k-btn k-btn-sm">
              CSV
            </Button>
          ) : null
        }
      />

      <section className="adm-card">
        <div style={{ padding: 14, borderBottom: '1px solid var(--line-1)' }}>
          <Space wrap>
            <DatePicker.RangePicker
              showTime
              value={range}
              onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
            />
            <BranchFilterSelect value={branchId} onChange={setBranchId} />
            <Input
              placeholder="키워드 (번호/상담원)"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 220 }}
              onPressEnter={() => void load()}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={() => void load()} loading={loading}>
              조회
            </Button>
          </Space>
        </div>
        <ResponsiveTable<HistoryRow>
          rowKey="callId"
          dataSource={rows ?? []}
          loading={loading}
          size="small"
          pagination={{ pageSize: 50, size: 'small' }}
          columns={[
            {
              title: '시작',
              dataIndex: 'startedAt',
              width: 150,
              render: (v: string) => <span className="k-mono">{dayjs(v).format('MM-DD HH:mm:ss')}</span>,
            },
            {
              title: '발신',
              dataIndex: 'ani',
              width: 130,
              render: (v: string) => <span className="k-mono">{v}</span>,
            },
            {
              title: '수신 (대표 / DID)',
              width: 190,
              render: (_: unknown, r: HistoryRow) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong className="k-mono">{r.representativeNumber ?? '-'}</Typography.Text>
                  <Typography.Text type="secondary" className="k-mono" style={{ fontSize: 11 }}>
                    {r.didNumber ?? r.dnis ?? '-'}
                  </Typography.Text>
                </Space>
              ),
            },
            { title: '큐', dataIndex: 'queueName', width: 130 },
            { title: '상담원', render: (_: unknown, r: HistoryRow) => r.primaryAgent?.agentName ?? '-', width: 100 },
            {
              title: '결과',
              dataIndex: 'sessionStatus',
              width: 110,
              render: (v: string) => {
                const meta = RESULT_META[v] ?? { label: v, color: 'var(--fg-3)' };
                return (
                  <span className="k-chip" style={{ color: meta.color, borderColor: meta.color }}>
                    <span className="k-dot" style={{ background: meta.color }} />
                    {meta.label}
                  </span>
                );
              },
            },
            {
              title: '통화',
              dataIndex: 'talkSeconds',
              width: 90,
              render: (v: number) => <span className="k-mono">{fmtDur(v)}</span>,
            },
            {
              title: '포기',
              dataIndex: 'abandonFlag',
              width: 70,
              render: (v: boolean) => v ? <Tag color="error">포기</Tag> : '-',
            },
            {
              title: '녹취',
              dataIndex: 'recordingFlag',
              width: 70,
              render: (v: boolean) => v ? <Tag color="processing">REC</Tag> : '-',
            },
            ...(analysisEnabled
              ? [
                  {
                    title: 'AI 분석',
                    width: 90,
                    render: (_: unknown, r: HistoryRow) => (
                      <Button
                        size="small"
                        icon={<FileTextOutlined />}
                        disabled={!r.recordingFlag}
                        onClick={() => setAnalysisCallId(r.callId)}
                      >
                        보기
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </section>

      <CallAnalysisDrawer
        callId={analysisEnabled ? analysisCallId : null}
        canRetry={permission?.canOperate ?? false}
        onClose={() => setAnalysisCallId(null)}
      />
    </>
  );
}
