import { Alert, Card, Col, Radio, Row, Select, Space, Spin, Tabs, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type QueueOption,
  type TrendPoint,
  type TrendResponse,
  fetchQueueOptions,
  fetchTrends,
} from '../api/trendsApi';
import type { TrendResolution } from '../trendSeries';
import { usePermissionStore } from '../../../store/usePermissionStore';
import { CallInsightsPanel } from './CallInsightsPanel';
import { TrendChart, type ChartSeries } from './TrendChart';
import { RANGE_PRESETS, type RangePresetKey, resolveRange } from '../rangePresets';

const RESOLUTIONS: Array<{ value: TrendResolution | 'auto'; label: string }> = [
  { value: 'auto', label: '자동' },
  { value: 'PT1M', label: '1분' },
  { value: 'PT5M', label: '5분' },
  { value: 'PT1H', label: '1시간' },
  { value: 'P1D', label: '1일' },
];

const series = (points: TrendPoint[], key: keyof TrendPoint) =>
  points.map((point) => ({ at: point.at, value: point[key] as number | null }));

export function TrendsPage() {
  const [preset, setPreset] = useState<RangePresetKey>('today');
  const [resolution, setResolution] = useState<TrendResolution | 'auto'>('auto');
  const [queueId, setQueueId] = useState<string | undefined>(undefined);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [data, setData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tab, setTab] = useState<'trends' | 'insights'>('trends');
  // 메뉴가 없는 기능이라 자격을 직접 본다. 자격 판정은 서버가 한 것을 그대로 쓴다.
  const insightsEnabled = usePermissionStore((s) => s.featureEntitlements['ai-insights'] ?? false);

  useEffect(() => {
    fetchQueueOptions().then(setQueues).catch(() => setQueues([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = resolveRange(preset);
      setData(await fetchTrends({
        from: range.from,
        to: range.to,
        ...(resolution === 'auto' ? {} : { resolution }),
        ...(queueId ? { queueId } : {}),
      }));
    } catch (caught: any) {
      // 서버가 왜 거절했는지 그대로 보여준다 (예: 구간이 너무 촘촘함).
      setError(caught?.response?.data?.error?.message ?? caught?.message ?? '조회에 실패했습니다.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, resolution, queueId]);

  useEffect(() => { void load(); }, [load]);

  const range = useMemo(() => resolveRange(preset), [preset]);
  const points = data?.points ?? [];
  const timestamps = useMemo(() => points.map((point) => point.at), [points]);
  const outageIndexes = useMemo(
    () => points.map((point, index) => (point.amiConnected === false ? index : -1)).filter((index) => index >= 0),
    [points],
  );
  const missingSnapshots = points.filter((point) => point.agentsLoggedIn === null).length;

  const charts: Array<{ title: string; extra?: string; series: ChartSeries[]; unit?: string }> = [
    {
      title: '호 흐름',
      series: [
        { key: 'inbound', label: '인입', color: 'var(--accent-info)', values: series(points, 'inbound') },
        { key: 'answered', label: '응답', color: 'var(--signal)', values: series(points, 'answered') },
        { key: 'abandoned', label: '포기', color: 'var(--accent-danger)', values: series(points, 'abandoned') },
      ],
    },
    {
      title: '대기 상황',
      extra: '대기 호수와 그 구간의 최장 대기',
      series: [
        { key: 'waitingCalls', label: '대기 호수', color: 'var(--accent-warn)', values: series(points, 'waitingCalls') },
        { key: 'longestWaitSeconds', label: '최장 대기(초)', color: 'var(--accent-danger)', values: series(points, 'longestWaitSeconds') },
      ],
    },
    {
      title: '상담원',
      series: [
        { key: 'agentsAvailable', label: '대기', color: 'var(--signal)', values: series(points, 'agentsAvailable'), stacked: true },
        { key: 'agentsTalking', label: '통화', color: 'var(--accent-info)', values: series(points, 'agentsTalking'), stacked: true },
        { key: 'agentsAcw', label: '후처리', color: 'var(--accent-warn)', values: series(points, 'agentsAcw'), stacked: true },
        { key: 'agentsBreak', label: '휴식', color: 'var(--fg-3)', values: series(points, 'agentsBreak'), stacked: true },
      ],
    },
    {
      title: '리소스',
      extra: '트렁크 점유와 응답하는 단말 수',
      series: [
        { key: 'trunkChannelsInUse', label: '트렁크 점유', color: 'var(--accent-info)', values: series(points, 'trunkChannelsInUse') },
        { key: 'endpointsReachable', label: '응답 단말', color: 'var(--signal)', values: series(points, 'endpointsReachable') },
      ],
    },
  ];

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="trends-page">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Card size="small" bodyStyle={{ padding: 12 }}>
          <Space wrap size={12}>
            <Radio.Group
              value={preset}
              onChange={(event) => setPreset(event.target.value)}
              optionType="button"
              buttonStyle="solid"
              options={RANGE_PRESETS.map((item) => ({ value: item.key, label: item.label }))}
            />
            <Radio.Group
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              optionType="button"
              options={RESOLUTIONS}
            />
            <Select
              allowClear
              placeholder="전체 큐"
              style={{ minWidth: 180 }}
              value={queueId}
              onChange={(value) => setQueueId(value)}
              options={queues.map((queue) => ({
                value: queue.queueId,
                label: queue.queueDisplayName || queue.queueName,
              }))}
            />
            {data && (
              <Typography.Text type="secondary">
                {data.range.resolution} · {points.length}구간
                {hovered && ` · ${new Date(hovered.at).toLocaleString('ko-KR')}`}
              </Typography.Text>
            )}
          </Space>
        </Card>

        {error && <Alert type="error" showIcon message={error} />}

        {!error && missingSnapshots > 0 && (
          <Alert
            type="info"
            showIcon
            message={`${missingSnapshots}개 구간은 대기·상담원·리소스를 측정하지 않았습니다.`}
            description="적재를 시작하기 전이거나 서버가 멈췄던 구간입니다. 해당 구간은 선을 끊어 표시하며, 0 이 아니라 '값 없음'입니다. 호 인입·응답·포기는 통화 이력에서 집계하므로 그 구간에도 정확합니다."
          />
        )}

        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as 'trends' | 'insights')}
          items={[
            {
              key: 'trends',
              label: '운영 추이',
              children: (
                <Spin spinning={loading}>
                  <Row gutter={[12, 12]}>
                    {charts.map((chart) => (
                      <Col xs={24} key={chart.title}>
                        <Card
                          size="small"
                          title={chart.title}
                          extra={chart.extra && <Typography.Text type="secondary">{chart.extra}</Typography.Text>}
                        >
                          <TrendChart
                            series={chart.series}
                            timestamps={timestamps}
                            resolution={data?.range.resolution ?? 'PT1M'}
                            outageIndexes={chart.title === '리소스' ? outageIndexes : []}
                            hoverIndex={hoverIndex}
                            onHoverIndex={setHoverIndex}
                          />
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </Spin>
              ),
            },
            ...(insightsEnabled
              ? [
                  {
                    key: 'insights',
                    label: 'AI 인사이트',
                    children: (
                      <CallInsightsPanel
                        from={range.from}
                        to={range.to}
                        resolution={resolution === 'auto' ? undefined : resolution}
                        queueId={queueId}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Space>
    </div>
  );
}
