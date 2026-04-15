// apps/admin/src/pages/MonitoringPage.tsx
import { Alert, Button, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useHealthData } from '../features/monitoring/hooks/useHealthData';

const { Title, Text } = Typography;

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
    <Row gutter={[16, 16]}>
      {items.map(({ label, value }) => (
        <Col key={label} xs={24} sm={8}>
          <Card>
            <Statistic
              title={label}
              value={value.toUpperCase()}
              valueStyle={{ color: infraColor(value) }}
            />
          </Card>
        </Col>
      ))}
    </Row>
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
      <Row gutter={[16, 16]}>
        {items.map(({ label, value, suffix, danger }) => (
          <Col key={label} xs={12} sm={8} md={6}>
            <Statistic
              title={label}
              value={value}
              suffix={suffix}
              valueStyle={danger && value > 0 ? { color: '#ff4d4f' } : undefined}
            />
          </Col>
        ))}
      </Row>
    </Card>
  );
}

// ----- Main page -----
export function MonitoringPage() {
  const { data, lastUpdated, isLoading, error, secondsUntilRefresh, refetch } =
    useHealthData({ intervalMs: 10_000 });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Control bar */}
      <Card size="small">
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Title level={4} style={{ margin: 0 }}>시스템 모니터링</Title>
          <Space>
            {lastUpdated && (
              <Text type="secondary">마지막 갱신: {dayjs(lastUpdated).format('HH:mm:ss')}</Text>
            )}
            {error && !data && <Tag color="error">오류</Tag>}
            <Button
              icon={<ReloadOutlined />}
              onClick={refetch}
              loading={isLoading}
            >
              새로고침
            </Button>
            <Text type="secondary">다음 갱신: {secondsUntilRefresh}초 후</Text>
          </Space>
        </Space>
      </Card>

      {/* Alert banners */}
      {data && <AlertBanners data={data} />}

      {/* Infra status */}
      {data && <InfraCards data={data} />}

      {/* Call metrics */}
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

      {/* Agent metrics */}
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

      {/* Queue metrics */}
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

      {/* Initial load / error state */}
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
