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
