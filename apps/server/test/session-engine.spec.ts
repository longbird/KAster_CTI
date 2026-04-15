import { SESSION_PRECEDENCE, statusRank, computeFingerprint } from '../src/modules/calls/session-engine.service';

describe('SESSION_PRECEDENCE (conv 44 역행 가드)', () => {
  it('단조 증가 순서', () => {
    expect(SESSION_PRECEDENCE.NEW).toBeLessThan(SESSION_PRECEDENCE.QUEUED);
    expect(SESSION_PRECEDENCE.QUEUED).toBeLessThan(SESSION_PRECEDENCE.RINGING_AGENT);
    expect(SESSION_PRECEDENCE.RINGING_AGENT).toBeLessThan(SESSION_PRECEDENCE.TALKING);
    expect(SESSION_PRECEDENCE.TALKING).toBeLessThan(SESSION_PRECEDENCE.AFTER_CALL_WORK);
    expect(SESSION_PRECEDENCE.AFTER_CALL_WORK).toBeLessThan(SESSION_PRECEDENCE.ENDED);
  });

  it('TALKING 에서 RINGING_AGENT 로 내려가는 것은 역행 (statusRank 감소)', () => {
    expect(statusRank('RINGING_AGENT')).toBeLessThan(statusRank('TALKING'));
  });

  it('unknown 상태는 -1 을 반환해 항상 덮어쓰기 가능', () => {
    expect(statusRank('UNKNOWN_STATE')).toBe(-1);
    expect(statusRank(null)).toBe(-1);
    expect(statusRank(undefined)).toBe(-1);
  });
});

describe('computeFingerprint (conv 44 dedupe)', () => {
  const base = {
    eventName: 'QueueCallerJoin',
    linkedid: 'L-123',
    uniqueid: 'U-456',
    channel: 'PJSIP/trunk-0001',
    destChannel: 'PJSIP/1001-0002',
    eventTime: '2026-04-14T00:00:00.000Z',
  };

  it('동일 입력은 동일 fingerprint 를 반환한다', () => {
    expect(computeFingerprint(base)).toBe(computeFingerprint(base));
  });

  it('eventName 이 달라지면 fingerprint 도 달라진다', () => {
    const a = computeFingerprint(base);
    const b = computeFingerprint({ ...base, eventName: 'Hangup' });
    expect(a).not.toBe(b);
  });

  it('1초 이내 재전송은 같은 bucket 이므로 같은 fingerprint', () => {
    const a = computeFingerprint({ ...base, eventTime: '2026-04-14T00:00:00.500Z' });
    const b = computeFingerprint({ ...base, eventTime: '2026-04-14T00:00:00.999Z' });
    expect(a).toBe(b);
  });

  it('1초 경계를 넘으면 fingerprint 가 달라진다', () => {
    const a = computeFingerprint({ ...base, eventTime: '2026-04-14T00:00:00.000Z' });
    const b = computeFingerprint({ ...base, eventTime: '2026-04-14T00:00:01.500Z' });
    expect(a).not.toBe(b);
  });

  it('sha256 hex 형식(64자 hex)을 반환한다', () => {
    const fp = computeFingerprint(base);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});
