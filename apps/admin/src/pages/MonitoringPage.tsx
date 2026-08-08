// apps/admin/src/pages/MonitoringPage.tsx
import { Alert, Button, Card, Descriptions, Space, Statistic, Tag, Typography } from 'antd';
import { formatAgeSeconds, formatNullableCount } from '../features/resilience/operatingMode';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useHealthData } from '../features/monitoring/hooks/useHealthData';
import { apiClient } from '../shared/lib/apiClient';

const { Title, Text } = Typography;

interface OperationalMonitoring {
  status: 'ok' | 'warning' | 'critical';
  timestamp: string;
  outbox: {
    pending: number;
    oldestCreatedAt: string | null;
    status: 'ok' | 'warning' | 'critical';
    thresholds: { warning: number; critical: number };
  };
  recovery: {
    lastHour: number;
    status: 'ok' | 'warning' | 'critical';
    thresholds: { warning: number; critical: number };
  };
  websocket: {
    clients: number;
    status: 'ok' | 'warning' | 'critical';
  };
  alerts: Array<{ key: string; severity: 'warning' | 'critical'; message: string }>;
}

// ----- Alert banners -----
function AlertBanners({ data }: { data: ReturnType<typeof useHealthData>['data'] }) {
  if (!data) return null;

  const alerts: { key: string; type: 'error' | 'warning'; message: string }[] = [];

  if (data.checks.db === 'down' || data.checks.redis === 'down') {
    alerts.push({
      key: 'infra-down',
      type: 'error',
      message: '🔴 위험: 인프라 다운 감지 — DB 또는 Redis 응답 없음',
    });
  }
  if (data.checks.ami === 'disconnected') {
    alerts.push({
      key: 'ami-down',
      type: 'error',
      message: '🔴 위험: AMI 연결 끊김 — 콜 이벤트 수신 불가',
    });
  }
  if (data.call.stuck > 0) {
    alerts.push({
      key: 'stuck',
      type: 'warning',
      message: `⚠ 경고: 10분 이상 상태 변경 없는 콜 ${data.call.stuck}건`,
    });
  }
  if (data.call.longestWaitingSeconds > 300) {
    alerts.push({
      key: 'wait',
      type: 'warning',
      message: `⚠ 경고: 최장 대기 ${data.call.longestWaitingSeconds}초 — 임계값(5분) 초과`,
    });
  }

  if (alerts.length === 0) return null;

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {alerts.map((a) => (
        <Alert key={a.key} type={a.type} message={a.message} showIcon />
      ))}
    </Space>
  );
}

// ----- Infra status cards -----
type InfraVal = 'up' | 'down' | 'degraded' | 'connected' | 'disconnected';

function infraColor(v: InfraVal): string {
  if (v === 'up' || v === 'connected') return '#52c41a';
  if (v === 'degraded') return '#faad14';
  return '#ff4d4f';
}

function InfraCards({ data }: { data: ReturnType<typeof useHealthData>['data'] }) {
  if (!data) return null;
  const items = [
    { label: 'DB', value: data.checks.db },
    { label: 'Redis', value: data.checks.redis },
    { label: 'AMI', value: data.checks.ami },
  ] as { label: string; value: InfraVal }[];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
      }}
    >
      {items.map(({ label, value }) => (
        <Card
          key={label}
          size="small"
          styles={{ body: { padding: 18 } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text type="secondary" strong>
              {label}
            </Text>
            <Tag color={value === 'up' || value === 'connected' ? 'success' : value === 'degraded' ? 'warning' : 'error'}>
              {value}
            </Tag>
          </div>
          <Card
            size="small"
            bordered={false}
            styles={{
              body: {
                padding: 14,
                background: 'var(--bg-2)',
                border: '1px solid var(--line-1)',
                borderRadius: 8,
              },
            }}
          >
            <Statistic
              value={value.toUpperCase()}
              valueStyle={{ color: infraColor(value) }}
              formatter={(current) => <span style={{ fontSize: 24, fontWeight: 700 }}>{current}</span>}
            />
          </Card>
        </Card>
      ))}
    </div>
  );
}

// ----- Metric card grid -----
interface MetricItem {
  label: string;
  value: number;
  suffix?: string;
  danger?: boolean;
}

function MetricGrid({ title, items }: { title: string; items: MetricItem[] }) {
  return (
    <Card title={title}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
        }}
      >
        {items.map(({ label, value, suffix, danger }) => (
          <Card
            key={label}
            size="small"
            styles={{ body: { padding: 16 } }}
          >
            <Statistic
              title={label}
              value={value}
              suffix={suffix}
              valueStyle={danger && value > 0 ? { color: '#ff4d4f' } : undefined}
            />
          </Card>
        ))}
      </div>
    </Card>
  );
}


// ----- DB 장애 대응 지표 -----
const MODE_TAG_COLOR: Record<string, string> = {
  NORMAL: 'green',
  DB_FAILOVER: 'orange',
  RECOVERING: 'orange',
  DEGRADED: 'red',
};

function ResiliencePanel({ data }: { data: ReturnType<typeof useHealthData>['data'] }) {
  // 구버전 서버는 이 블록을 보내지 않는다. 그때는 패널 자체를 감춘다.
  if (!data?.resilience) return null;

  const r = data.resilience;
  const mode = data.operatingMode ?? 'NORMAL';

  return (
    <Card
      title={
        <Space>
          <span>DB 장애 대응</span>
          <Tag color={MODE_TAG_COLOR[mode] ?? 'default'}>{mode}</Tag>
        </Space>
      }
    >
      <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small" bordered>
        <Descriptions.Item label="DB 역할">{r.dbRole}</Descriptions.Item>
        <Descriptions.Item label="복제 지연">
          {r.replicationLagSeconds === null ? '—' : `${Math.round(r.replicationLagSeconds)}초`}
        </Descriptions.Item>
        <Descriptions.Item label="데이터 신선도">
          {data.dataFreshness ? `DB ${data.dataFreshness.db} / 설정 ${data.dataFreshness.config}` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="LKG 버전">{r.lkgVersion ?? '없음'}</Descriptions.Item>
        <Descriptions.Item label="LKG 생성 경과">{formatAgeSeconds(r.lkgAgeSeconds)}</Descriptions.Item>
        <Descriptions.Item label="설정 버전 불일치">
          <span style={r.configVersionMismatch > 0 ? { color: '#ff4d4f' } : undefined}>
            {r.configVersionMismatch}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="미처리 이벤트">
          <span style={r.offlineEventQueueDepth > 0 ? { color: '#ff4d4f' } : undefined}>
            {r.offlineEventQueueDepth}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="미처리 명령">
          {formatNullableCount(r.offlineCommandQueueDepth)}
        </Descriptions.Item>
        <Descriptions.Item label="WAL 아카이브 경과">
          {formatAgeSeconds(r.walArchiveAgeSeconds)}
        </Descriptions.Item>
        <Descriptions.Item label="마지막 백업 성공" span={3}>
          {r.backupLastSuccessTimestamp
            ? new Date(r.backupLastSuccessTimestamp).toLocaleString()
            : '기록 없음'}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

function statusColor(status: 'ok' | 'warning' | 'critical') {
  if (status === 'ok') return 'success';
  if (status === 'warning') return 'warning';
  return 'error';
}

function OperationalStatus({ data }: { data: OperationalMonitoring | null }) {
  if (!data) return null;

  const items = [
    {
      label: 'Outbox backlog',
      value: data.outbox.pending,
      status: data.outbox.status,
      detail: data.outbox.oldestCreatedAt
        ? `최오래 미발행 ${dayjs(data.outbox.oldestCreatedAt).format('HH:mm:ss')}`
        : '미발행 없음',
    },
    {
      label: '복구 종료(1시간)',
      value: data.recovery.lastHour,
      status: data.recovery.status,
      detail: `주의 ${data.recovery.thresholds.warning}건 / 장애 ${data.recovery.thresholds.critical}건`,
    },
    {
      label: 'WebSocket 연결',
      value: data.websocket.clients,
      status: data.websocket.status,
      detail: '현재 연결 클라이언트',
    },
  ];

  return (
    <Card title="운영 지표">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap>
          <Text type="secondary">종합 상태</Text>
          <Tag color={statusColor(data.status)}>{data.status}</Tag>
          <Text type="secondary">기준 시각 {dayjs(data.timestamp).format('HH:mm:ss')}</Text>
        </Space>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          {items.map((item) => (
            <Card key={item.label} size="small" styles={{ body: { padding: 16 } }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text type="secondary">{item.label}</Text>
                  <Tag color={statusColor(item.status)}>{item.status}</Tag>
                </Space>
                <Statistic value={item.value} />
                <Text type="secondary">{item.detail}</Text>
              </Space>
            </Card>
          ))}
        </div>
      </Space>
    </Card>
  );
}

// ----- Main page -----
export function MonitoringPage() {
  const { data, lastUpdated, isLoading, error, secondsUntilRefresh, refetch } =
    useHealthData({ intervalMs: 10_000 });
  const [opsData, setOpsData] = useState<OperationalMonitoring | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsError, setOpsError] = useState<string | null>(null);

  const loadOperationalMonitoring = useCallback(async () => {
    setOpsLoading(true);
    try {
      const res = await apiClient.get('/admin/monitoring/operations');
      setOpsData((res.data?.data ?? res.data) as OperationalMonitoring);
      setOpsError(null);
    } catch (err) {
      setOpsError(err instanceof Error ? err.message : '운영 지표 조회 실패');
    } finally {
      setOpsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOperationalMonitoring();
    const id = setInterval(() => void loadOperationalMonitoring(), 10_000);
    return () => clearInterval(id);
  }, [loadOperationalMonitoring]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Title level={4} style={{ margin: 0 }}>시스템 모니터링</Title>
            <Text type="secondary">인프라 연결 상태와 실시간 콜/에이전트/큐 지표를 확인합니다.</Text>
          </div>
          <Space>
            {lastUpdated && (
              <Text type="secondary">마지막 갱신: {dayjs(lastUpdated).format('HH:mm:ss')}</Text>
            )}
            {error && !data && <Tag color="error">오류</Tag>}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                refetch();
                void loadOperationalMonitoring();
              }}
              loading={isLoading || opsLoading}
            >
              새로고침
            </Button>
            <Text type="secondary">다음 갱신: {secondsUntilRefresh}초 후</Text>
          </Space>
        </Space>
      </Card>

      {data && <AlertBanners data={data} />}
      {opsData?.alerts.map((alert) => (
        <Alert key={alert.key} type={alert.severity === 'critical' ? 'error' : 'warning'} message={alert.message} showIcon />
      ))}
      {opsError ? <Alert type="warning" message={`운영 지표 조회 실패: ${opsError}`} showIcon /> : null}
      {data && <InfraCards data={data} />}
      <ResiliencePanel data={data} />
      <OperationalStatus data={opsData} />
      {data && (
        <MetricGrid
          title="콜 지표"
          items={[
            { label: '전체 활성', value: data.call.active },
            { label: '대기 중', value: data.call.queued },
            { label: '링잉', value: data.call.ringing },
            { label: '통화 중', value: data.call.talking },
            { label: '보류', value: data.call.hold },
            { label: '전환 중', value: data.call.transferring },
            { label: '스턱 콜', value: data.call.stuck, danger: true },
            { label: '최장 대기', value: data.call.longestWaitingSeconds, suffix: '초' },
          ]}
        />
      )}
      {data && (
        <MetricGrid
          title="에이전트 지표"
          items={[
            { label: '로그인', value: data.agent.loggedIn },
            { label: '수신 가능', value: data.agent.available },
            { label: '통화 중', value: data.agent.talking },
            { label: '링잉', value: data.agent.ringing },
            { label: '휴식/일시정지', value: data.agent.paused },
          ]}
        />
      )}
      {data && (
        <MetricGrid
          title="큐 지표"
          items={[
            { label: '대기 콜', value: data.queue.waiting },
            { label: '링잉', value: data.queue.ringing },
            { label: '통화 중', value: data.queue.talking },
            { label: '수신 가능 에이전트', value: data.queue.availableAgents },
            { label: '최장 대기', value: data.queue.longestWaitSeconds, suffix: '초' },
          ]}
        />
      )}
      {isLoading && !data && (
        <Card>
          <Text type="secondary">데이터 로딩 중...</Text>
        </Card>
      )}
      {error && !data && (
        <Card>
          <Text type="danger">연결 불가: {error}</Text>
        </Card>
      )}
    </Space>
  );
}
