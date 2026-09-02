import { maskPii } from './pii-mask.util';

describe('maskPii', () => {
  it('휴대폰 번호의 가운데 자리를 가린다', () => {
    expect(maskPii('연락처는 010-1234-5678 입니다')).toBe('연락처는 010-****-5678 입니다');
    expect(maskPii('01012345678 로 주세요')).toBe('010-****-5678 로 주세요');
    expect(maskPii('010 1234 5678')).toBe('010-****-5678');
  });

  it('지역번호 유선번호도 가린다', () => {
    expect(maskPii('02-123-4567')).toBe('02-***-4567');
    expect(maskPii('031-1234-5678')).toBe('031-****-5678');
  });

  it('주민등록번호는 뒷자리를 통째로 가린다', () => {
    expect(maskPii('990101-1234567')).toBe('990101-*******');
    expect(maskPii('9901011234567 확인')).toBe('990101-******* 확인');
  });

  it('카드번호는 마지막 4자리만 남긴다', () => {
    expect(maskPii('1234-5678-9012-3456')).toBe('****-****-****-3456');
    expect(maskPii('1234 5678 9012 3456')).toBe('****-****-****-3456');
  });

  it('카드번호를 전화번호보다 먼저 판정한다', () => {
    expect(maskPii('카드 4111-1111-1111-1111 결제')).toBe('카드 ****-****-****-1111 결제');
  });

  it('한 문장에 여러 건이 있어도 전부 가린다', () => {
    expect(maskPii('010-1111-2222 와 010-3333-4444')).toBe('010-****-2222 와 010-****-4444');
  });

  it('개인정보가 아닌 숫자는 건드리지 않는다', () => {
    expect(maskPii('주문번호 2026-0730-88213 입니다')).toBe('주문번호 2026-0730-88213 입니다');
    expect(maskPii('금액은 38400원')).toBe('금액은 38400원');
    expect(maskPii('내선 1001 로 연결')).toBe('내선 1001 로 연결');
  });

  it('빈 값과 비문자열은 빈 문자열로 돌려준다', () => {
    expect(maskPii('')).toBe('');
    expect(maskPii(null as unknown as string)).toBe('');
    expect(maskPii(undefined as unknown as string)).toBe('');
  });
});
