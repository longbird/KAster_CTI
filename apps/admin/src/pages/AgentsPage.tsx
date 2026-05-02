import { DownloadOutlined } from '@ant-design/icons';
import { Button, Skeleton, Table, Tag } from 'antd';
import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../config';
import { getAgentSip } from '../features/asterisk-config/api/asteriskConfigApi';
import { useAdminRealtimeRefresh } from '../realtime/useAdminRealtimeRefresh';
import { downloadCsv } from '../shared/lib/csv';
import { usePermissionStore } from '../store/usePermissionStore';

interface AgentRow {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  role: string;
  employmentStatus: string;
  lastLoginAt: string | null;
  currentStatus: { statusCode: string; reasonCode?: string; startedAt: string } | null;
  sipRegistrationStatus?: string | null;
  sipContactUri?: string | null;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: '대기', color: 'var(--status-available)' },
  RINGING: { label: '벨 울림', color: 'var(--status-ringing)' },
  TALKING: { label: '통화 중', color: 'var(--status-talking)' },
  AFTER_CALL_WORK: { label: '후처리', color: 'var(--status-acw)' },
  BREAK: { label: '휴식', color: 'var(--status-break)' },
  MEAL: { label: '식사', color: 'var(--accent-warn)' },
  TRAINING: { label: '교육', color: 'var(--status-training)' },
  MANUAL_PAUSED: { label: '일시중지', color: 'var(--status-offline)' },
  OFFLINE: { label: '오프라인', color: 'var(--status-offline)' },
};

function StatusChip({ code }: { code: string }) {
  const meta = STATUS_META[code] ?? STATUS_META.OFFLINE;
  return (
    <span className="k-chip" style={{ color: meta.color, borderColor: meta.color, background: 'transparent' }}>
      <span className="k-dot" style={{ background: meta.color }} />
      {meta.label}
      <span className="k-mono" style={{ color: meta.color, opacity: 0.7, fontSize: 9 }}>
        {code === 'AFTER_CALL_WORK' ? 'ACW' : code}
      </span>
    </span>
  );
}

function readToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AgentsPage() {
  const agentPermission = usePermissionStore((state) => state.permissionsByMenu['agents']);
  const [rows, setRows] = useState<AgentRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      const token = readToken();
      const [res, sipRows] = await Promise.all([
        axios.get(`${API_BASE_URL}/agents`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        getAgentSip().catch(() => []),
      ]);
      const sipByExtension = new Map(sipRows.map((row) => [row.extension, row]));
      setRows(
        (res.data?.data ?? []).map((row: AgentRow) => {
          const sip = sipByExtension.get(row.extension);
          return {
            ...row,
            sipRegistrationStatus: sip?.registrationStatus ?? 'UNREGISTERED',
            sipContactUri: sip?.contactUri ?? null,
          };
        }),
      );
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  useAdminRealtimeRefresh(() => void load(), ['agent.status.changed', 'call.updated', 'call.ended']);

  if (!rows) return <Skeleton active paragraph={{ rows: 8 }} />;

  const exportRows = () => {
    downloadCsv(
      `agents-status-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.csv`,
      ['이름', '로그인 ID', '내선', '전화기 등록', '역할', '현재 상태', '마지막 로그인'],
      rows.map((row) => [
        row.agentName,
        row.loginId,
        row.extension,
        row.sipRegistrationStatus ?? 'UNREGISTERED',
        row.role,
        row.currentStatus?.statusCode ?? 'OFFLINE',
        row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '-',
      ]),
    );
  };

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1 className="adm-page-title">상담원 현황</h1>
          <div className="adm-page-sub">이벤트 즉시 갱신 / 5초 보정 · /api/v1/agents</div>
        </div>
        {agentPermission?.canExport ? (
          <Button icon={<DownloadOutlined />} onClick={exportRows} disabled={rows.length === 0} className="k-btn k-btn-sm">
            CSV 내보내기
          </Button>
        ) : null}
      </div>
      <section className="adm-card">
        <Table<AgentRow>
          rowKey="agentId"
          dataSource={rows}
          pagination={false}
          columns={[
            { title: '이름', dataIndex: 'agentName' },
            { title: '로그인 ID', dataIndex: 'loginId' },
            { title: '내선', dataIndex: 'extension' },
            {
              title: '전화기 등록',
              render: (_, r) => {
                const status = r.sipRegistrationStatus ?? 'UNREGISTERED';
                if (/Avail|Reachable|NonQual|NonQualified/i.test(status)) return <Tag color="green">등록됨</Tag>;
                if (/Unreach|Unavailable|Unknown/i.test(status)) return <Tag color="orange">{status}</Tag>;
                return <Tag>{status === 'UNREGISTERED' ? '미등록' : status}</Tag>;
              },
            },
            { title: '역할', dataIndex: 'role', render: (v: string) => <Tag>{v}</Tag> },
            { title: '현재 상태', render: (_, r) => <StatusChip code={r.currentStatus?.statusCode ?? 'OFFLINE'} /> },
            {
              title: '마지막 로그인',
              dataIndex: 'lastLoginAt',
              render: (v: string | null) => (v ? new Date(v).toLocaleString() : '-'),
            },
          ]}
        />
      </section>
    </>
  );
}
