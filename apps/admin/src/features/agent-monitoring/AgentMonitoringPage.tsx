import { Card, Col, Input, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { joinAgentsAndCalls, summarizeMonitorRows } from './fixtures';
import type { ActiveCallRow, AgentMonitorRow } from './types';
import { ResponsiveTable } from '../../components/ResponsiveTable';
import { AGENT_STATUS_TONE } from '../../shared/ui/tagTone';

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '대기',
  TALKING: '통화중',
  RINGING_AGENT: '호출중',
  AFTER_CALL_WORK: '후처리',
  HOLD: '보류',
  TRANSFERRING: '전환중',
  BREAK: '휴식',
  MEAL: '식사',
  TRAINING: '교육',
  MANUAL_PAUSED: '일시정지',
};

function formatStatus(code: string | undefined | null) {
  if (!code) return '-';
  return STATUS_LABELS[code] ?? code;
}

function statusColor(code: string | undefined | null) {
  if (!code) return 'default';
  return AGENT_STATUS_TONE[code] ?? 'default';
}

function secondsSince(iso: string | null | undefined, now: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  const delta = Math.floor((now - t) / 1000);
  return delta < 0 ? 0 : delta;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  if (mm < 60) {
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  const hh = Math.floor(mm / 60);
  const remainingMm = mm % 60;
  return `${hh}:${String(remainingMm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function AgentMonitoringPage() {
  const [rows, setRows] = useState<AgentMonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [onlineOnly, setOnlineOnly] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [agentsRes, callsRes] = await Promise.all([
          apiClient.get('/agents'),
          apiClient.get('/calls/active', { params: { limit: 500 } }),
        ]);
        if (!alive) return;
        const agentsData = agentsRes.data?.data ?? [];
        const callsData: ActiveCallRow[] = callsRes.data?.data ?? [];
        setRows(joinAgentsAndCalls(agentsData, callsData));
        setErrorMessage(null);
      } catch (error) {
        if (!alive) return;
        setErrorMessage(error instanceof Error ? error.message : '조회 실패');
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    const dataTimer = window.setInterval(() => void load(), 5000);
    const tickTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(dataTimer);
      window.clearInterval(tickTimer);
    };
  }, []);

  const groupOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.agentGroup) {
        map.set(row.agentGroup.agentGroupId, row.agentGroup.groupName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = query.trim();
    return rows.filter((row) => {
      if (onlineOnly && row.loginStatus !== 'LOGGED_IN') {
        return false;
      }
      if (groupFilter === '__none__') {
        if (row.agentGroup) return false;
      } else if (groupFilter !== 'all') {
        if (row.agentGroup?.agentGroupId !== groupFilter) return false;
      }
      if (statusFilter !== 'all') {
        const code = row.currentStatus?.statusCode ?? 'OFFLINE';
        if (statusFilter === 'OFFLINE') {
          if (code !== 'OFFLINE' && row.loginStatus === 'LOGGED_IN') return false;
        } else if (code !== statusFilter) {
          return false;
        }
      }
      if (keyword) {
        const haystack = [
          row.agentName,
          row.extension,
          row.loginId,
          row.agentGroup?.groupName,
          row.activeCall?.ani,
          row.activeCall?.dnis,
          row.activeCall?.queueName,
        ]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.includes(keyword));
        if (!haystack) return false;
      }
      return true;
    });
  }, [rows, query, groupFilter, statusFilter, onlineOnly]);

  const summary = summarizeMonitorRows(filteredRows);

  const columns: ColumnsType<AgentMonitorRow> = [
    {
      title: '상담원',
      dataIndex: 'agentName',
      width: 200,
      render: (value, row) => (
        <Space direction="vertical" size={0}>
          <span>{value}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.loginId} / {row.extension}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '그룹',
      dataIndex: ['agentGroup', 'groupName'],
      width: 140,
      render: (_, row) => row.agentGroup?.groupName ?? '미지정',
    },
    {
      title: '로그인',
      dataIndex: 'loginStatus',
      width: 100,
      render: (value: string) =>
        value === 'LOGGED_IN' ? <Tag color="success">온라인</Tag> : <Tag>오프라인</Tag>,
    },
    {
      title: '전화기',
      width: 110,
      render: (_, row) =>
        row.sipRegistration.registered ? (
          <Tag color="success">등록</Tag>
        ) : (
          <Tag color="warning">{row.sipRegistration.registrationStatus || '미등록'}</Tag>
        ),
    },
    {
      title: '상태',
      width: 130,
      render: (_, row) => {
        const code = row.currentStatus?.statusCode;
        const elapsed = secondsSince(row.currentStatus?.startedAt, now);
        return (
          <Space direction="vertical" size={0}>
            <Tag color={statusColor(code)}>{formatStatus(code)}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(elapsed)}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: '활성 통화',
      render: (_, row) => {
        if (!row.activeCall) {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }
        const direction = (row.activeCall.direction ?? '').toUpperCase();
        const counterparty =
          direction === 'OUTBOUND' ? row.activeCall.dnis : row.activeCall.ani;
        const elapsed = secondsSince(row.activeCall.answeredAt, now);
        return (
          <Space direction="vertical" size={0}>
            <span>
              {direction === 'OUTBOUND' ? '발신' : '수신'} · {counterparty ?? '-'}
            </span>
            <Typography.Text type="secondary" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {row.activeCall.queueName ?? '-'} · {formatDuration(elapsed)}
            </Typography.Text>
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row gutter={16}>
          <Col span={4}>
            <Statistic title="전체" value={summary.total} />
          </Col>
          <Col span={4}>
            <Statistic title="온라인" value={summary.online} valueStyle={{ color: 'var(--signal)' }} />
          </Col>
          <Col span={4}>
            <Statistic title="대기" value={summary.available} />
          </Col>
          <Col span={4}>
            <Statistic title="통화중" value={summary.talking} valueStyle={{ color: 'var(--accent-info)' }} />
          </Col>
          <Col span={4}>
            <Statistic title="후처리" value={summary.afterCall} />
          </Col>
          <Col span={4}>
            <Statistic title="휴식" value={summary.rest} />
          </Col>
        </Row>
      </Card>

      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Select
              style={{ minWidth: 160 }}
              value={groupFilter}
              onChange={setGroupFilter}
              options={[
                { value: 'all', label: '전체 그룹' },
                ...groupOptions,
                { value: '__none__', label: '미지정' },
              ]}
              aria-label="그룹 필터"
            />
            <Select
              style={{ minWidth: 140 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: '전체 상태' },
                { value: 'AVAILABLE', label: '대기' },
                { value: 'TALKING', label: '통화중' },
                { value: 'AFTER_CALL_WORK', label: '후처리' },
                { value: 'BREAK', label: '휴식' },
                { value: 'OFFLINE', label: '오프라인' },
              ]}
              aria-label="상태 필터"
            />
            <Select
              style={{ minWidth: 130 }}
              value={onlineOnly ? 'online' : 'all'}
              onChange={(v) => setOnlineOnly(v === 'online')}
              options={[
                { value: 'all', label: '온/오프라인 모두' },
                { value: 'online', label: '온라인만' },
              ]}
              aria-label="로그인 필터"
            />
            <Input
              style={{ width: 240 }}
              placeholder="이름, 내선, 통화번호"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="검색"
            />
            <Typography.Text type="secondary">5초 갱신 · {filteredRows.length}명</Typography.Text>
            {errorMessage ? (
              <Typography.Text type="danger">{errorMessage}</Typography.Text>
            ) : null}
          </Space>

          <ResponsiveTable<AgentMonitorRow>
            rowKey="agentId"
            loading={loading && rows.length === 0}
            dataSource={filteredRows}
            columns={columns}
            pagination={false}
            size="middle"
            tableLayout="fixed"
          />
        </Space>
      </Card>
    </Space>
  );
}
