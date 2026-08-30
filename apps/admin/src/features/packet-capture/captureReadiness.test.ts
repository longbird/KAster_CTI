import { describe, expect, it } from 'vitest';
import {
  describeJobStatus,
  evaluateCaptureReadiness,
  formatFileSize,
  type PacketCaptureSettings,
} from './captureReadiness';

function settings(overrides: Partial<PacketCaptureSettings> = {}): PacketCaptureSettings {
  return {
    enabled: true,
    hardEnabled: true,
    dumpcapAvailable: true,
    isLeaderNode: true,
    encryptionEnabled: true,
    interfaces: ['eth0', 'any'],
    defaultInterface: 'any',
    maxDurationSeconds: 600,
    retentionDays: 7,
    nodeId: 'dev-node',
    ...overrides,
  };
}

describe('evaluateCaptureReadiness', () => {
  it('모든 조건이 갖춰지면 준비 완료다', () => {
    const result = evaluateCaptureReadiness(settings());
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('설정을 못 불러오면 준비되지 않은 것으로 본다', () => {
    expect(evaluateCaptureReadiness(null).ready).toBe(false);
  });

  it.each([
    ['하드 킬스위치', { hardEnabled: false }, /PACKET_CAPTURE_ENABLED/],
    ['테넌트 토글', { enabled: false }, /테넌트의 패킷 캡처가 꺼져/],
    ['dumpcap 부재', { dumpcapAvailable: false }, /dumpcap/],
    ['비리더 노드', { isLeaderNode: false }, /리더가 아닙니다/],
    ['인터페이스 없음', { interfaces: [] }, /인터페이스가 없습니다/],
  ])('%s 는 시작을 막고 이유를 남긴다', (_label, override, pattern) => {
    const result = evaluateCaptureReadiness(settings(override as Partial<PacketCaptureSettings>));
    expect(result.ready).toBe(false);
    expect(result.blockers.some((reason) => pattern.test(reason))).toBe(true);
  });

  it('막힌 이유가 여러 개면 모두 보여준다', () => {
    const result = evaluateCaptureReadiness(
      settings({ enabled: false, dumpcapAvailable: false, isLeaderNode: false }),
    );
    expect(result.blockers).toHaveLength(3);
  });

  // 암호화가 꺼져 있어도 캡처는 가능해야 한다. 다만 평문 저장을 알려야 한다.
  it('암호화가 꺼져 있으면 막지 않고 경고만 한다', () => {
    const result = evaluateCaptureReadiness(settings({ encryptionEnabled: false }));
    expect(result.ready).toBe(true);
    expect(result.warnings.some((w) => /평문/.test(w))).toBe(true);
  });
});

describe('describeJobStatus', () => {
  it.each([
    ['RUNNING', '캡처 중'],
    ['COMPLETED', '완료'],
    ['FAILED', '실패'],
    ['DELETED_BY_RETENTION', '보존기간 만료 삭제'],
  ])('%s 를 한국어 라벨로 바꾼다', (status, label) => {
    expect(describeJobStatus(status).label).toBe(label);
  });

  it('모르는 상태는 그대로 보여준다', () => {
    expect(describeJobStatus('WEIRD').label).toBe('WEIRD');
  });
});

describe('formatFileSize', () => {
  it.each([
    [null, '-'],
    [undefined, '-'],
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('%s -> %s', (input, expected) => {
    expect(formatFileSize(input as number | null | undefined)).toBe(expected);
  });

  // Prisma BigInt 는 JSON 을 거치며 문자열로 온다.
  it('문자열로 온 BigInt 도 처리한다', () => {
    expect(formatFileSize('2048')).toBe('2.0 KB');
  });
});
