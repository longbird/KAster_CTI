import { buildSystemVersion } from './system-version';

describe('buildSystemVersion', () => {
  const startedAt = new Date('2026-08-09T00:00:00.000Z');
  const now = new Date('2026-08-09T01:02:03.000Z');

  it('패키지 버전과 가동 시간을 반환한다', () => {
    const result = buildSystemVersion({
      packageVersion: '0.1.0',
      nodeVersion: 'v22.11.0',
      startedAt,
      now,
    });

    expect(result).toMatchObject({
      version: '0.1.0',
      nodeVersion: 'v22.11.0',
      startedAt: '2026-08-09T00:00:00.000Z',
      uptimeSeconds: 3723,
    });
  });

  it('빌드 시점 정보가 주입되면 그대로 노출한다', () => {
    const result = buildSystemVersion({
      packageVersion: '0.1.0',
      commit: '  c8e2f62  ',
      buildTime: '2026-08-09T00:00:00Z',
      nodeId: 'pbx-node-1',
      startedAt,
      now,
    });

    expect(result.commit).toBe('c8e2f62');
    expect(result.buildTime).toBe('2026-08-09T00:00:00.000Z');
    expect(result.nodeId).toBe('pbx-node-1');
  });

  it('빌드 정보가 없으면 null 로 남기고 버전은 unknown 으로 둔다', () => {
    // 배포 파이프라인이 GIT_COMMIT / BUILD_TIME 을 주입하지 않아도
    // 엔드포인트는 동작해야 한다. 없는 값을 지어내지 않는다.
    const result = buildSystemVersion({ startedAt, now });

    expect(result.version).toBe('unknown');
    expect(result.commit).toBeNull();
    expect(result.buildTime).toBeNull();
    expect(result.nodeId).toBeNull();
  });

  it('빈 문자열과 파싱 불가한 빌드 시각은 null 로 처리한다', () => {
    const result = buildSystemVersion({
      packageVersion: '   ',
      commit: '',
      buildTime: 'not-a-date',
      nodeId: '  ',
      startedAt,
      now,
    });

    expect(result.version).toBe('unknown');
    expect(result.commit).toBeNull();
    expect(result.buildTime).toBeNull();
    expect(result.nodeId).toBeNull();
  });

  it('시계가 뒤로 간 경우에도 가동 시간을 음수로 두지 않는다', () => {
    const result = buildSystemVersion({
      packageVersion: '0.1.0',
      startedAt: now,
      now: startedAt,
    });

    expect(result.uptimeSeconds).toBe(0);
  });
});
