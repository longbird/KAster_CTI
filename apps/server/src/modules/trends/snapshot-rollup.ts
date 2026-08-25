/**
 * 스냅샷 롤업 — 세밀한 행 여러 개를 굵은 해상도 한 행으로 접는다.
 *
 * 지표마다 접는 방법이 다르다. 전부 평균으로 접으면 지표의 의미가 사라진다:
 * 최장 대기 3초 / 180초 / 5초 를 평균 내면 63초가 되어, 3분짜리 대기가 있었다는
 * 사실이 사라진다. 용량 판단에 쓰는 트렁크 점유도 마찬가지로 "몇 개까지 찼는가"가
 * 근거이지 평균이 아니다.
 */

export type SnapshotResolution = 'PT1M' | 'PT5M' | 'PT1H' | 'P1D';

export const RESOLUTION_MS: Record<SnapshotResolution, number> = {
  PT1M: 60_000,
  PT5M: 300_000,
  PT1H: 3_600_000,
  P1D: 86_400_000,
};

/** 평균으로 접는 지표. "그 구간 동안 대체로 몇이었나"를 묻는 값들. */
const AVERAGED = [
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

/** 최대로 접는 지표. 피크가 곧 정보인 값들. */
const PEAKED = ['longestWaitSeconds', 'trunkChannelsInUse'] as const;

type MetricKey = (typeof AVERAGED)[number] | (typeof PEAKED)[number];

export interface SnapshotRow {
  tenantId: string;
  queueId: string | null;
  capturedAt: Date;
  amiConnected?: boolean | null;
  [metric: string]: unknown;
}

export interface RolledSnapshot extends SnapshotRow {
  resolution: SnapshotResolution;
}

/** 시각을 해상도 경계로 내린다. 적재와 조회가 같은 경계를 쓰도록 한 곳에 둔다. */
export function floorToResolution(at: Date, resolution: SnapshotResolution): Date {
  const step = RESOLUTION_MS[resolution];
  return new Date(Math.floor(at.getTime() / step) * step);
}

function numbersAt(rows: SnapshotRow[], key: MetricKey): number[] {
  return rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === 'number');
}

/**
 * 값이 있는 것만으로 접는다. 하나도 없으면 `null` 이다.
 *
 * `null` 을 0 으로 세면 안 된다. AMI 가 끊겨 트렁크 점유를 못 읽은 구간이 "0채널
 * 사용"으로 기록되고, 나중에 용량을 볼 때 놀고 있었다는 거짓말이 된다.
 */
function foldMetric(rows: SnapshotRow[], key: MetricKey, mode: 'avg' | 'max'): number | null {
  const values = numbersAt(rows, key);
  if (values.length === 0) return null;
  if (mode === 'max') return Math.max(...values);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function bucketKey(row: SnapshotRow, resolution: SnapshotResolution): string {
  return [
    row.tenantId,
    row.queueId ?? '',
    floorToResolution(row.capturedAt, resolution).getTime(),
  ].join('|');
}

function foldBucket(rows: SnapshotRow[], resolution: SnapshotResolution): RolledSnapshot {
  const folded: Record<string, unknown> = {
    tenantId: rows[0].tenantId,
    queueId: rows[0].queueId,
    capturedAt: floorToResolution(rows[0].capturedAt, resolution),
    resolution,
  };

  for (const key of AVERAGED) folded[key] = foldMetric(rows, key, 'avg');
  for (const key of PEAKED) folded[key] = foldMetric(rows, key, 'max');

  // AMI 는 한 번이라도 끊겼으면 끊긴 것으로 접는다. 5분 중 1분이 장애였다면
  // 그 5분은 장애 구간이다 — 다수결로 삼키면 짧은 장애가 통째로 사라진다.
  const amiFlags = rows
    .map((row) => row.amiConnected)
    .filter((value): value is boolean => typeof value === 'boolean');
  folded.amiConnected = amiFlags.length === 0 ? null : amiFlags.every(Boolean);

  return folded as RolledSnapshot;
}

export function rollUpSnapshots(
  rows: SnapshotRow[],
  resolution: SnapshotResolution,
): RolledSnapshot[] {
  const buckets = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const key = bucketKey(row, resolution);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  return [...buckets.values()]
    .map((bucket) => foldBucket(bucket, resolution))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
}
