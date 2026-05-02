import { Space, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useAdminRealtimeRefresh } from '../../realtime/useAdminRealtimeRefresh';
import { apiClient } from '../../shared/lib/apiClient';
import { AdmPageHead } from '../../shared/ui/AdmPageHead';
import { CallDetailDrawer, type CallRow } from './CallDetailDrawer';

const STATUS_META: Record<string, { label: string; color: string }> = {
  QUEUED:          { label: '대기열',  color: 'var(--accent-warn)' },
  RINGING_AGENT:   { label: '벨 울림', color: 'var(--status-ringing)' },
  TALKING:         { label: '통화 중', color: 'var(--status-talking)' },
  AFTER_CALL_WORK: { label: '후처리',  color: 'var(--status-acw)' },
  TRANSFERRING:    { label: '전환 중', color: 'var(--accent-info)' },
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

function fmtSec(sec?: number) {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function CallStatusChip({ code }: { code: string }) {
  const meta = STATUS_META[code] ?? { label: code, color: 'var(--fg-3)' };
  return (
    <span
      className="k-chip"
      style={{ color: meta.color, borderColor: meta.color, background: 'transparent' }}
    >
      <span className="k-dot k-dot-live" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function LiveCallsPage() {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [selected, setSelected] = useState<CallRow | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/calls/active', { params: { limit: 500 } });
      setRows(res.data?.data ?? []);
      setLastUpdated(new Date());
    } catch {
      // keep previous data on error
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load]);
  useAdminRealtimeRefresh(() => void load(), ['call.created', 'call.updated', 'call.ended']);

  return (
    <>
      <AdmPageHead
        title="실시간 콜"
        sub={`${lastUpdated ? lastUpdated.toLocaleTimeString() + ' 기준' : '로딩 중'} · 이벤트 즉시 갱신 / 3초 보정 · ${rows.length}건`}
        right={
          <span
            className="k-chip"
            style={{
              color: 'var(--signal)',
              borderColor: 'var(--signal-dim)',
              background: 'var(--signal-soft)',
            }}
          >
            <span className="k-dot k-dot-live" style={{ background: 'var(--signal)' }} />
            LIVE
          </span>
        }
      />
      <section className="adm-card">
        <Table<CallRow>
          rowKey="callId"
          dataSource={rows}
          pagination={false}
          onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer' } })}
          locale={{ emptyText: '현재 활성 통화가 없습니다.' }}
          columns={[
            {
              title: '상태',
              dataIndex: 'sessionStatus',
              width: 180,
              render: (v: string) => <CallStatusChip code={v} />,
            },
            { title: '고객 번호', dataIndex: 'ani', width: 140 },
            {
              title: '대표번호 / DID',
              width: 180,
              render: (_: unknown, r: CallRow) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{r.representativeNumber ?? '-'}</Typography.Text>
                  <Typography.Text type="secondary">{r.didNumber ?? r.dnis ?? '-'}</Typography.Text>
                </Space>
              ),
            },
            { title: '큐', dataIndex: 'queueName', render: (v?: string) => v ?? '-' },
            {
              title: '상담원',
              render: (_: unknown, r: CallRow) => r.agentName || r.primaryAgentId || '-',
            },
            {
              title: '대기',
              dataIndex: 'waitSeconds',
              render: (v?: number) => <span className="k-mono">{fmtSec(v)}</span>,
            },
            {
              title: '통화',
              dataIndex: 'talkSeconds',
              render: (v?: number) => <span className="k-mono">{fmtSec(v)}</span>,
            },
            {
              title: '전환',
              width: 150,
              render: (_: unknown, r: CallRow) =>
                r.latestTransfer ? (
                  <Tag color={TRANSFER_PHASE_COLOR[r.latestTransfer.phase] ?? 'default'}>
                    {r.latestTransfer.phase}
                    {r.latestTransfer.toExtension ? ` · ${r.latestTransfer.toExtension}` : ''}
                  </Tag>
                ) : (
                  '-'
                ),
            },
            {
              title: '큐 진입',
              dataIndex: 'queuedAt',
              render: (v?: string) => v ? new Date(v).toLocaleTimeString() : '-',
            },
          ]}
        />
      </section>

      <CallDetailDrawer
        call={selected}
        onClose={() => setSelected(null)}
        onHangup={() => void load()}
      />
    </>
  );
}
