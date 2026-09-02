import { Prisma } from '@prisma/client';
import { SnapshotResolution } from './snapshot-rollup';

/** Postgres `date_trunc` 단위. 5분은 trunc 로 안 되므로 따로 계산한다. */
const TRUNC_UNIT: Record<SnapshotResolution, string> = {
  PT1M: 'minute',
  PT5M: 'minute',
  PT1H: 'hour',
  P1D: 'day',
};

/**
 * `callSessions` 를 별칭 `s` 로 조인한 쿼리에서 `startedAt` 을 해상도 버킷으로 접는 식.
 *
 * 추이(호 인입)와 AI 인사이트가 같은 시간축을 써야 해서 한 곳에 둔다.
 * 두 곳에 복제하면 5분 버킷 계산이 조용히 어긋난다.
 */
export function buildStartedAtBucketExpression(resolution: SnapshotResolution): Prisma.Sql {
  const unit = TRUNC_UNIT[resolution];
  if (resolution !== 'PT5M') {
    return Prisma.sql`date_trunc(${unit}, s."startedAt")`;
  }
  return Prisma.sql`
      date_trunc('hour', s."startedAt")
        + make_interval(mins => (EXTRACT(MINUTE FROM s."startedAt")::int / 5) * 5)
    `;
}
