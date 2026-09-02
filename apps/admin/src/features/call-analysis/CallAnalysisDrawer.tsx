import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Drawer, Empty, Skeleton, Space, Tabs, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { getCallAnalysis, getCallTranscript, retryCallAnalysis } from './api/callAnalysisApi';
import type { CallAnalysis, CallTranscriptResponse } from './types/callAnalysis';
import { formatSegmentTime, SENTIMENT_META, SPEAKER_LABELS } from './types/callAnalysis';

interface Props {
  callId: string | null;
  onClose: () => void;
  /** supervisor/admin 만 재분석을 요청할 수 있다. */
  canRetry?: boolean;
}

const SPEAKER_STYLE: Record<string, { align: 'flex-start' | 'flex-end'; background: string }> = {
  CUSTOMER: { align: 'flex-start', background: 'var(--bg-2, #f5f5f5)' },
  AGENT: { align: 'flex-end', background: 'var(--accent-soft, #e6f4ff)' },
  UNKNOWN: { align: 'flex-start', background: 'var(--bg-2, #f5f5f5)' },
};

export function CallAnalysisDrawer({ callId, onClose, canRetry = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [analysis, setAnalysis] = useState<CallAnalysis | null>(null);
  const [transcript, setTranscript] = useState<CallTranscriptResponse | null>(null);
  const [notReady, setNotReady] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setNotReady(false);
    // 분석과 전문은 따로 준비되므로 한쪽이 아직 없어도 나머지는 보여준다.
    const [analysisResult, transcriptResult] = await Promise.allSettled([
      getCallAnalysis(id),
      getCallTranscript(id),
    ]);

    setAnalysis(analysisResult.status === 'fulfilled' ? analysisResult.value : null);
    setTranscript(transcriptResult.status === 'fulfilled' ? transcriptResult.value : null);
    setNotReady(analysisResult.status === 'rejected' && transcriptResult.status === 'rejected');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!callId) {
      setAnalysis(null);
      setTranscript(null);
      return;
    }
    void load(callId);
  }, [callId, load]);

  const handleRetry = async () => {
    if (!callId) return;
    setRetrying(true);
    try {
      await retryCallAnalysis(callId);
      message.success('분석을 다시 요청했습니다. 잠시 후 새로고침해 주세요.');
    } catch (error: any) {
      console.error(error);
      message.error(error?.response?.data?.error?.message ?? '분석을 요청하지 못했습니다.');
    } finally {
      setRetrying(false);
    }
  };

  const sentimentMeta = analysis ? SENTIMENT_META[analysis.sentiment] : null;

  return (
    <Drawer
      open={Boolean(callId)}
      onClose={onClose}
      title="통화 AI 분석"
      width={640}
      extra={
        canRetry ? (
          <Button icon={<ReloadOutlined />} loading={retrying} onClick={() => void handleRetry()}>
            다시 분석
          </Button>
        ) : null
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : notReady ? (
        <Empty
          description={
            <Space direction="vertical" size={4}>
              <Typography.Text>아직 분석 결과가 없습니다.</Typography.Text>
              <Typography.Text type="secondary">
                녹취가 확정된 뒤 분석이 순서대로 처리됩니다.
              </Typography.Text>
            </Space>
          }
        />
      ) : (
        <Tabs
          defaultActiveKey="summary"
          items={[
            {
              key: 'summary',
              label: '요약',
              children: analysis ? (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Typography.Paragraph style={{ fontSize: 15, marginBottom: 0 }}>
                    {analysis.summary}
                  </Typography.Paragraph>
                  <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="고객 감정">
                      <Space>
                        <Tag color={sentimentMeta?.color}>{sentimentMeta?.label}</Tag>
                        {analysis.sentimentScore !== null && (
                          <Typography.Text type="secondary">
                            {analysis.sentimentScore.toFixed(2)}
                          </Typography.Text>
                        )}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="상담분류">
                      {analysis.category ? `${analysis.category.name} (${analysis.category.code})` : '미분류'}
                    </Descriptions.Item>
                    <Descriptions.Item label="키워드">
                      {analysis.keywords?.length
                        ? analysis.keywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="위험 신호">
                      {analysis.riskFlags?.length
                        ? analysis.riskFlags.map((flag) => (
                            <Tag color="orange" key={flag}>
                              {flag}
                            </Tag>
                          ))
                        : '없음'}
                    </Descriptions.Item>
                    <Descriptions.Item label="분석 모델">
                      {analysis.modelName ?? analysis.provider}
                    </Descriptions.Item>
                  </Descriptions>
                </Space>
              ) : (
                <Alert type="info" showIcon message="요약이 아직 준비되지 않았습니다." />
              ),
            },
            {
              key: 'transcript',
              label: `전문${transcript ? ` (${transcript.segments.length})` : ''}`,
              children: transcript ? (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {transcript.segments.length === 0 ? (
                    <Empty description="인식된 발화가 없습니다." />
                  ) : (
                    transcript.segments.map((segment) => {
                      const style = SPEAKER_STYLE[segment.speaker] ?? SPEAKER_STYLE.UNKNOWN;
                      return (
                        <div
                          key={segment.segmentId}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: style.align }}
                        >
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {SPEAKER_LABELS[segment.speaker]} · {formatSegmentTime(segment.startMs)}
                          </Typography.Text>
                          <div
                            style={{
                              maxWidth: '80%',
                              padding: '8px 12px',
                              borderRadius: 8,
                              background: style.background,
                            }}
                          >
                            {segment.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </Space>
              ) : (
                <Alert type="info" showIcon message="전문이 아직 준비되지 않았습니다." />
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
}
