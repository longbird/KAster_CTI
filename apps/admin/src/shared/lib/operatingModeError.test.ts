import { describe, expect, it } from 'vitest';
import {
  extractOperatingModeRestriction,
  operatingModeRestrictionMessage,
} from './operatingModeError';

const restricted = {
  code: 'OPERATING_MODE_RESTRICTED',
  message: 'DB 장애 대응 모드에서는 일반 설정 변경을 저장할 수 없습니다.',
  operatingMode: 'DEGRADED',
};

describe('extractOperatingModeRestriction', () => {
  it('예외 필터가 본문을 그대로 낸 경우를 인식한다', () => {
    const found = extractOperatingModeRestriction({ response: { status: 503, data: restricted } });

    expect(found?.operatingMode).toBe('DEGRADED');
  });

  it('envelope 로 감싸인 경우도 인식한다', () => {
    const found = extractOperatingModeRestriction({
      response: { status: 503, data: { success: false, data: null, error: restricted } },
    });

    expect(found?.code).toBe('OPERATING_MODE_RESTRICTED');
  });

  it('code 없는 503 은 무시한다', () => {
    // 로드밸런서/프록시도 503 을 낸다. 그때 "설정 변경 차단" 이라고 안내하면
    // 운영자가 원인을 잘못 짚는다.
    expect(
      extractOperatingModeRestriction({ response: { status: 503, data: 'Service Unavailable' } }),
    ).toBeNull();
  });

  it('다른 상태 코드는 무시한다', () => {
    expect(extractOperatingModeRestriction({ response: { status: 500, data: restricted } })).toBeNull();
    expect(extractOperatingModeRestriction({ response: { status: 403, data: restricted } })).toBeNull();
  });

  it('응답 자체가 없으면(네트워크 오류) 무시한다', () => {
    expect(extractOperatingModeRestriction(new Error('Network Error'))).toBeNull();
    expect(extractOperatingModeRestriction(undefined)).toBeNull();
  });
});

describe('operatingModeRestrictionMessage', () => {
  it('서버 메시지에 현재 모드를 덧붙인다', () => {
    expect(operatingModeRestrictionMessage(restricted)).toContain('DEGRADED');
    expect(operatingModeRestrictionMessage(restricted)).toContain('저장할 수 없습니다');
  });

  it('메시지가 비어 있으면 기본 문구를 쓴다', () => {
    expect(operatingModeRestrictionMessage({ code: 'X' })).toContain('저장할 수 없습니다');
  });
});
