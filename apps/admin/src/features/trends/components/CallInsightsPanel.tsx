import { Alert, Card, Col, Empty, Progress, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  type CallInsightsResponse,
  type CategoryInsight,
  fetchCallInsights,
} from '../api/trendsApi';
import { computeCoverageRate, formatChangeRate } from '../insights/insightFormat';
import type { TrendResolution } from '../trendSeries';
import { TrendChart } from './TrendChart';

interface Props {
  from: string;
  to: string;
  resolution?: TrendResolution;
  queueId?: string;
}

const UNCLASSIFIED_LABEL = '미분류';

export function CallInsightsPanel({ from, to, resolution, queueId }: Props) {
  const [data, setData] = useState<CallInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchCallInsights({
          from,
          to,
          ...(resolution ? { resolution } : {}),
          ...(queueId ? { queueId } : {}),
        }),
      );
    } catch (caught: any) {
      setError(caught?.response?.data?.error?.message ?? caught?.message ?? '조회에 실패했습니다.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, resolution, queueId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <Alert type="error" showIcon message={error} />;
  }

  const series = data?.sentimentSeries ?? [];
  const timestamps = series.map((point) => point.at);
  const coverageRate = data ? computeCoverageRate(data.totals.analyzedCalls, data.totals.totalCalls) : null;
  const hasAnalysis = (data?.totals.analyzedCalls ?? 0) > 0;

  const categoryColumns = [
    {
      title: '상담분류',
      key: 'name',
      render: (_: unknown, row: CategoryInsight) =>
        row.name ? (
          <Space size={6}>
            <span>{row.name}</span>
            <Typography.Text code>{row.code}</Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">{UNCLASSIFIED_LABEL}</Typography.Text>
        ),
    },
    { title: '건수', dataIndex: 'calls', key: 'calls', width: 90 },
    {
      title: '부정',
      key: 'negativeCalls',
      width: 110,
      render: (_: unknown, row: CategoryInsight) =>
        row.negativeCalls > 0 ? (
          <Tag color="red">
            {row.negativeCalls} ({Math.round((row.negativeCalls / row.calls) * 100)}%)
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: '평균 통화',
      dataIndex: 'avgTalkSeconds',
      key: 'avgTalkSeconds',
      width: 110,
      render: (seconds: number) => (seconds > 0 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : '-'),
    },
  ];

  const keywordColumns = [
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    { title: '이번 구간', dataIndex: 'current', key: 'current', width: 100 },
    { title: '직전 구간', dataIndex: 'previous', key: 'previous', width: 100 },
    {
      title: '변화',
      key: 'delta',
      width: 130,
      render: (_: unknown, row: { delta: number; changeRate: number | null }) => (
        <Tag color={row.changeRate === null ? 'gold' : 'blue'}>
          +{row.delta} · {formatChangeRate(row.changeRate)}
        </Tag>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {data && (
          <Card size="small" bodyStyle={{ padding: 12 }}>
            <Space size={16} wrap align="center">
              <Typography.Text type="secondary">분석 커버리지</Typography.Text>
              <Progress
                percent={coverageRate === null ? 0 : Math.round(coverageRate * 100)}
                size="small"
                style={{ width: 200 }}
                status={coverageRate !== null && coverageRate < 0.5 ? 'exception' : 'normal'}
              />
              <Typography.Text>
                {data.totals.analyzedCalls} / {data.totals.totalCalls}건 분석됨
              </Typography.Text>
            </Space>
          </Card>
        )}

        {data && !hasAnalysis ? (
          <Empty
            description={
              <Space direction="vertical" size={4}>
                <Typography.Text>이 구간에 분석된 통화가 없습니다.</Typography.Text>
                <Typography.Text type="secondary">
                  녹취가 확정된 뒤 분석이 처리됩니다. 통화 AI 분석이 꺼져 있으면 결과가 쌓이지 않습니다.
                </Typography.Text>
              </Space>
            }
          />
        ) : (
          <>
            <Card size="small" title="고객 감정 추이">
              <TrendChart
                series={[
                  {
                    key: 'positive',
                    label: '긍정',
                    color: 'var(--signal)',
                    stacked: true,
                    values: series.map((point) => ({ at: point.at, value: point.positive })),
                  },
                  {
                    key: 'neutral',
                    label: '중립',
                    color: 'var(--fg-3)',
                    stacked: true,
                    values: series.map((point) => ({ at: point.at, value: point.neutral })),
                  },
                  {
                    key: 'negative',
                    label: '부정',
                    color: 'var(--accent-danger)',
                    stacked: true,
                    values: series.map((point) => ({ at: point.at, value: point.negative })),
                  },
                ]}
                timestamps={timestamps}
                resolution={data?.range.resolution ?? 'PT1H'}
                hoverIndex={hoverIndex}
                onHoverIndex={setHoverIndex}
              />
            </Card>

            <Row gutter={[12, 12]}>
              <Col xs={24} lg={14}>
                <Card size="small" title="상담 주제 분포">
                  <Table
                    rowKey={(row) => row.categoryId ?? UNCLASSIFIED_LABEL}
                    size="small"
                    pagination={false}
                    columns={categoryColumns}
                    dataSource={data?.categories ?? []}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={10}>
                <Card
                  size="small"
                  title="급상승 키워드"
                  extra={
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      직전 같은 길이 구간 대비
                    </Typography.Text>
                  }
                >
                  <Table
                    rowKey="keyword"
                    size="small"
                    pagination={false}
                    columns={keywordColumns}
                    dataSource={data?.risingKeywords ?? []}
                    locale={{ emptyText: '늘어난 키워드가 없습니다.' }}
                  />
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Space>
    </Spin>
  );
}
