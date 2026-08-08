import {
  assertFeatureCodeUsable,
  FEATURE_CODE_CATALOG,
  getFeatureCodeCatalogEntry,
  isHandsetDialFeature,
  normalizeFeatureCode,
} from './feature-code-catalog';

describe('feature code catalog', () => {
  it('카탈로그는 고정 4개이고 키가 중복되지 않는다', () => {
    const keys = FEATURE_CODE_CATALOG.map((entry) => entry.featureKey);
    expect(keys).toEqual(['pickup', 'attendedTransferComplete', 'hold', 'resume']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('단말에서 다이얼하는 기능은 대리응답뿐이다', () => {
    // 나머지 셋은 서버가 PBX 로 보내는 DTMF 라 dialplan 에 렌더링하면 안 된다.
    expect(FEATURE_CODE_CATALOG.filter((e) => e.invocation === 'HANDSET_DIAL')
      .map((e) => e.featureKey)).toEqual(['pickup']);
    expect(isHandsetDialFeature('pickup')).toBe(true);
    expect(isHandsetDialFeature('hold')).toBe(false);
    expect(isHandsetDialFeature('없는키')).toBe(false);
  });

  it('카탈로그에 없는 키는 조회되지 않는다', () => {
    expect(getFeatureCodeCatalogEntry('pickup')?.defaultCode).toBe('*8');
    expect(getFeatureCodeCatalogEntry('nope')).toBeUndefined();
  });

  describe('normalizeFeatureCode', () => {
    it('공백을 제거하고 빈 값은 null 로 만든다', () => {
      expect(normalizeFeatureCode('  *8 ')).toBe('*8');
      expect(normalizeFeatureCode('')).toBeNull();
      expect(normalizeFeatureCode('   ')).toBeNull();
      expect(normalizeFeatureCode(null)).toBeNull();
      expect(normalizeFeatureCode(undefined)).toBeNull();
    });
  });

  describe('assertFeatureCodeUsable', () => {
    const resources = {
      extensions: ['1001', '2001'],
      queueExtens: ['5000'],
      didNumbers: ['07052346380'],
      speedDialCodes: ['*01'],
    };

    it('허용 형식을 통과시킨다', () => {
      expect(() => assertFeatureCodeUsable('*8', resources)).not.toThrow();
      expect(() => assertFeatureCodeUsable('#9', resources)).not.toThrow();
      expect(() => assertFeatureCodeUsable('*21', resources)).not.toThrow();
    });

    it('형식이 어긋나면 거부한다', () => {
      expect(() => assertFeatureCodeUsable('8', resources)).toThrow('* 또는 #');
      expect(() => assertFeatureCodeUsable('*', resources)).toThrow('형식');
      expect(() => assertFeatureCodeUsable('*8a', resources)).toThrow('형식');
      expect(() => assertFeatureCodeUsable('*12345678', resources)).toThrow('형식');
    });

    it('개행이 섞이면 거부한다', () => {
      // dialplan 주입 방지. 렌더러까지 가기 전에 막는다.
      expect(() => assertFeatureCodeUsable('*8\nexten => evil', resources)).toThrow('형식');
    });

    it('다른 번호 자원과 겹치면 거부한다', () => {
      expect(() => assertFeatureCodeUsable('*01', resources)).toThrow('단축 발신');
    });

    it('내선/분배룰/DID 와 겹치면 거부한다', () => {
      // 형식상 * 또는 # 로 시작해야 하므로 숫자 자원과는 충돌할 수 없지만,
      // 자원 목록이 * 접두 코드를 갖게 되면 걸러야 한다.
      expect(() => assertFeatureCodeUsable('*77', { ...resources, extensions: ['*77'] }))
        .toThrow('내선');
      expect(() => assertFeatureCodeUsable('*55', { ...resources, queueExtens: ['*55'] }))
        .toThrow('호 분배룰');
      expect(() => assertFeatureCodeUsable('*33', { ...resources, didNumbers: ['*33'] }))
        .toThrow('DID');
    });
  });
});
