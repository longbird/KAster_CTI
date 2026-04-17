import { Card, Skeleton, Table, Tag, Typography } from 'antd';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../config';
import { getAgentSip } from '../features/asterisk-config/api/asteriskConfigApi';

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

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'green',
  RINGING: 'gold',
  TALKING: 'blue',
  AFTER_CALL_WORK: 'purple',
  BREAK: 'red',
  MEAL: 'orange',
  TRAINING: 'cyan',
  MANUAL_PAUSED: 'default',
};

function readToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AgentsPage() {
  const [rows, setRows] = useState<AgentRow[] | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const token = readToken();
        const [res, sipRows] = await Promise.all([
          axios.get(`${API_BASE_URL}/agents`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          }),
          getAgentSip().catch(() => []),
        ]);
        if (!active) return;
        const sipByExtension = new Map(
          sipRows.map((row) => [row.extension, row]),
        );
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
        if (!active) return;
        setRows([]);
      }
    };

    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!rows) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        상담원 현황
      </Typography.Title>
      <Typography.Text type="secondary">5초 주기로 `/api/v1/agents` 폴링</Typography.Text>
      <Table<AgentRow>
        style={{ marginTop: 16 }}
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
          {
            title: '역할',
            dataIndex: 'role',
            render: (v: string) => <Tag>{v}</Tag>,
          },
          {
            title: '현재 상태',
            render: (_, r) =>
              r.currentStatus ? (
                <Tag color={STATUS_COLORS[r.currentStatus.statusCode] ?? 'default'}>
                  {r.currentStatus.statusCode}
                </Tag>
              ) : (
                <Tag>OFFLINE</Tag>
              ),
          },
          {
            title: '마지막 로그인',
            dataIndex: 'lastLoginAt',
            render: (v: string | null) => (v ? new Date(v).toLocaleString() : '-'),
          },
        ]}
      />
    </Card>
  );
}
