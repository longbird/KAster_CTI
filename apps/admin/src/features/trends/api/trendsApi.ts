import { apiClient } from '../../../shared/lib/apiClient';
import type { TrendResolution } from '../trendSeries';

/**
 * 한 구간의 지표.
 *
 * 통화 축(`inbound`/`answered`/`abandoned`/평균)은 통화 이력에서 집계하므로
 * 값이 없으면 `0` 이다 — 정말 통화가 없었다는 뜻이다.
 *
 * 리소스 축(대기·상담원·트렁크·단말)은 주기 스냅샷에서 오므로 `null` 일 수 있다.
 * 적재를 시작하기 전이거나 서버가 멈췄던 구간이며, <b>0 과 다른 사실이다.</b>
 */
export interface TrendPoint {
  at: string;
  inbound: number;
  answered: number;
  abandoned: number;
  avgWaitSeconds: number;
  avgTalkSeconds: number;
  waitingCalls: number | null;
  longestWaitSeconds: number | null;
  talkingCalls: number | null;
  ringingCalls: number | null;
  agentsAvailable: number | null;
  agentsRinging: number | null;
  agentsTalking: number | null;
  agentsAcw: number | null;
  agentsBreak: number | null;
  agentsLoggedIn: number | null;
  trunkChannelsInUse: number | null;
  endpointsTotal: number | null;
  endpointsRegistered: number | null;
  endpointsReachable: number | null;
  amiConnected: boolean | null;
}

export interface TrendResponse {
  range: { from: string; to: string; resolution: TrendResolution; queueId: string | null };
  points: TrendPoint[];
}

export interface TrendQuery {
  from: string;
  to: string;
  resolution?: TrendResolution;
  queueId?: string;
}

export async function fetchTrends(query: TrendQuery): Promise<TrendResponse> {
  const { data } = await apiClient.get('/admin/trends', { params: query });
  return data?.data ?? data;
}

export interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string | null;
}

export async function fetchQueueOptions(): Promise<QueueOption[]> {
  const { data } = await apiClient.get('/queues');
  const rows = data?.data ?? data ?? [];
  return Array.isArray(rows) ? rows : [];
}

/**
 * AI 인사이트.
 *
 * 추이의 리소스 축과 달리 스냅샷 적재가 없다 — 요청 시점에 통화 이력과 분석 결과를 조인해
 * 집계하므로 값이 없으면 `0` 이다.
 * `totals` 가 분석 커버리지다. analyzedCalls 가 totalCalls 보다 많이 낮으면
 * 아래 분포를 전체 통화의 분포로 읽으면 안 된다.
 */
export interface SentimentPoint {
  at: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export interface CategoryInsight {
  categoryId: string | null;
  code: string | null;
  name: string | null;
  calls: number;
  avgTalkSeconds: number;
  negativeCalls: number;
}

export interface CallInsightsResponse {
  range: { from: string; to: string; resolution: TrendResolution; queueId: string | null };
  totals: { totalCalls: number; analyzedCalls: number };
  sentimentSeries: SentimentPoint[];
  categories: CategoryInsight[];
  risingKeywords: Array<{
    keyword: string;
    current: number;
    previous: number;
    delta: number;
    changeRate: number | null;
  }>;
}

export async function fetchCallInsights(query: TrendQuery): Promise<CallInsightsResponse> {
  const { data } = await apiClient.get('/admin/call-insights', { params: query });
  return data?.data ?? data;
}
