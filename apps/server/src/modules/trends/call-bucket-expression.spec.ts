import { buildStartedAtBucketExpression } from './call-bucket-expression';

function sqlText(resolution: Parameters<typeof buildStartedAtBucketExpression>[0]) {
  return buildStartedAtBucketExpression(resolution).strings.join('?');
}

describe('buildStartedAtBucketExpression', () => {
  it.each([
    ['PT1M', 'minute'],
    ['PT1H', 'hour'],
    ['P1D', 'day'],
  ] as const)('%s 는 date_trunc(%s) 로 접는다', (resolution, unit) => {
    const expression = buildStartedAtBucketExpression(resolution);

    expect(sqlText(resolution)).toContain('date_trunc');
    expect(expression.values).toContain(unit);
  });

  // 5분은 date_trunc 단위가 아니라서 시(hour)로 접은 뒤 분을 5로 내림한다.
  it('PT5M 은 make_interval 로 직접 계산한다', () => {
    expect(sqlText('PT5M')).toContain('make_interval');
    expect(sqlText('PT5M')).toContain("date_trunc('hour'");
  });

  it('모든 해상도가 callSessions 별칭 s 를 쓴다', () => {
    for (const resolution of ['PT1M', 'PT5M', 'PT1H', 'P1D'] as const) {
      expect(sqlText(resolution)).toContain('s."startedAt"');
    }
  });
});
