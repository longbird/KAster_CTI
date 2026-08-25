/**
 * 두 출처를 한 시간축으로 합친다.
 *
 * 통화 축은 `callSessions` 에서 요청 시점에 집계하고, 리소스 축은 `dashboardSnapshots`
 * 에서 읽는다. 성격이 달라서 <b>빈 버킷의 의미도 다르다</b>:
 *
 * - 통화가 없던 버킷은 `0` 이다. callSessions 가 진실원이라 행이 없으면 정말 없었다.
 * - 스냅샷이 없던 버킷은 `null` 이다. 적재를 시작하기 전 구간이거나 서버가 멈췄던
 *   구간이며, 0 으로 채우면 "그때 트렁크가 놀고 있었다"는 거짓말이 된다.
 *
 * 화면은 `null` 구간에서 선을 끊는다.
 */
import { RESOLUTION_MS, SnapshotResolution, floorToResolution } from './snapshot-rollup';

export interface CallBucket {
  at: Date;
  inbound: number;
  answered: number;
  abandoned: number;
  avgWaitSeconds: number;
  avgTalkSeconds: number;
}

export interface SnapshotBucket {
  at: Date;
  resolution: SnapshotResolution;
  waitingCalls?: number | null;
  longestWaitSeconds?: number | null;
  talkingCalls?: number | null;
  ringingCalls?: number | null;
  agentsAvailable?: number | null;
  agentsRinging?: number | null;
  agentsTalking?: number | null;
  agentsAcw?: number | null;
  agentsBreak?: number | null;
  agentsLoggedIn?: number | null;
  trunkChannelsInUse?: number | null;
  endpointsTotal?: number | null;
  endpointsRegistered?: number | null;
  endpointsReachable?: number | null;
  amiConnected?: boolean | null;
}

export interface TrendPoint {
  at: Date;
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

const AVERAGED_KEYS = [
  'waitingCalls',
  'talkingCalls',
  'ringingCalls',
  'agentsAvailable',
  'agentsRinging',
  'agentsTalking',
  'agentsAcw',
  'agentsBreak',
  'agentsLoggedIn',
  'endpointsTotal',
  'endpointsRegistered',
  'endpointsReachable',
] as const;

const PEAKED_KEYS = ['longestWaitSeconds', 'trunkChannelsInUse'] as const;

/** 해상도가 세밀할수록 작다. 같은 버킷에 둘이 있으면 작은 쪽을 쓴다. */
function precedence(resolution: SnapshotResolution): number {
  return RESOLUTION_MS[resolution];
}

export function countBuckets(from: Date, to: Date, resolution: SnapshotResolution): number {
  const step = RESOLUTION_MS[resolution];
  const start = floorToResolution(from, resolution).getTime();
  return Math.max(0, Math.ceil((to.getTime() - start) / step));
}

/** 구간의 버킷 시작 시각들. 끝 경계는 포함하지 않는다. */
export function buildBucketStarts(
  from: Date,
  to: Date,
  resolution: SnapshotResolution,
): Date[] {
  const step = RESOLUTION_MS[resolution];
  const start = floorToResolution(from, resolution).getTime();
  const starts: Date[] = [];
  for (let at = start; at < to.getTime(); at += step) starts.push(new Date(at));
  return starts;
}

function fold(rows: SnapshotBucket[], key: string, mode: 'avg' | 'max'): number | null {
  const values = rows
    .map((row) => (row as any)[key])
    .filter((value): value is number => typeof value === 'number');
  if (values.length === 0) return null;
  if (mode === 'max') return Math.max(...values);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * 한 버킷에 모인 스냅샷을 하나로 접는다.
 *
 * 롤업 sweep 이 PT5M 을 쓰고 PT1M 을 지우는 사이에는 같은 시각의 행이 둘 다 존재할
 * 수 있다. 그대로 평균 내면 원본이 두 번 세어진다. 그래서 <b>가장 세밀한 해상도만</b>
 * 남기고 접는다.
 */
function foldSnapshotBucket(rows: SnapshotBucket[]): Partial<TrendPoint> {
  if (rows.length === 0) return {};

  const finest = Math.min(...rows.map((row) => precedence(row.resolution)));
  const kept = rows.filter((row) => precedence(row.resolution) === finest);

  const folded: Record<string, unknown> = {};
  for (const key of AVERAGED_KEYS) folded[key] = fold(kept, key, 'avg');
  for (const key of PEAKED_KEYS) folded[key] = fold(kept, key, 'max');

  // 한 번이라도 끊겼으면 그 버킷은 장애 구간이다. 다수결로 삼키지 않는다.
  const amiFlags = kept
    .map((row) => row.amiConnected)
    .filter((value): value is boolean => typeof value === 'boolean');
  folded.amiConnected = amiFlags.length === 0 ? null : amiFlags.every(Boolean);

  return folded as Partial<TrendPoint>;
}

const EMPTY_SNAPSHOT: Omit<TrendPoint, 'at' | 'inbound' | 'answered' | 'abandoned' | 'avgWaitSeconds' | 'avgTalkSeconds'> = {
  waitingCalls: null,
  longestWaitSeconds: null,
  talkingCalls: null,
  ringingCalls: null,
  agentsAvailable: null,
  agentsRinging: null,
  agentsTalking: null,
  agentsAcw: null,
  agentsBreak: null,
  agentsLoggedIn: null,
  trunkChannelsInUse: null,
  endpointsTotal: null,
  endpointsRegistered: null,
  endpointsReachable: null,
  amiConnected: null,
};

export interface MergeTrendInput {
  from: Date;
  to: Date;
  resolution: SnapshotResolution;
  calls: CallBucket[];
  snapshots: SnapshotBucket[];
}

export function mergeTrendPoints(input: MergeTrendInput): TrendPoint[] {
  const { resolution } = input;

  const callsByBucket = new Map<number, CallBucket>();
  for (const call of input.calls) {
    callsByBucket.set(floorToResolution(call.at, resolution).getTime(), call);
  }

  const snapshotsByBucket = new Map<number, SnapshotBucket[]>();
  for (const snapshot of input.snapshots) {
    const key = floorToResolution(snapshot.at, resolution).getTime();
    const bucket = snapshotsByBucket.get(key);
    if (bucket) bucket.push(snapshot);
    else snapshotsByBucket.set(key, [snapshot]);
  }

  return buildBucketStarts(input.from, input.to, resolution).map((at) => {
    const call = callsByBucket.get(at.getTime());
    return {
      at,
      // 통화는 없으면 0 이다. 행이 없다는 것이 곧 "통화가 없었다"이다.
      inbound: call?.inbound ?? 0,
      answered: call?.answered ?? 0,
      abandoned: call?.abandoned ?? 0,
      avgWaitSeconds: call?.avgWaitSeconds ?? 0,
      avgTalkSeconds: call?.avgTalkSeconds ?? 0,
      ...EMPTY_SNAPSHOT,
      ...foldSnapshotBucket(snapshotsByBucket.get(at.getTime()) ?? []),
    };
  });
}
