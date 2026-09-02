import {
  FEATURE_CATALOG,
  FEATURE_KEYS,
  defaultEnabledMap,
  getFeature,
  isFeatureKey,
  menuKeysHiddenBy,
} from './feature-catalog';
import { MENU_KEYS } from './menu-permission.service';

describe('기능 카탈로그', () => {
  describe('정합성', () => {
    // 없는 메뉴 키를 적으면 아무것도 안 감춰지는데 조용히 통과한다.
    it('모든 menuKeys 가 서버 MENU_KEYS 안에 있다', () => {
      const menuKeys = new Set(MENU_KEYS as unknown as string[]);

      for (const key of FEATURE_KEYS) {
        for (const menuKey of FEATURE_CATALOG[key].menuKeys) {
          expect(menuKeys.has(menuKey)).toBe(true);
        }
      }
    });

    // 되돌릴 수 없는 기능이 기본으로 켜져 있으면 끌 방법이 영영 없다.
    it('되돌릴 수 없는 기능은 기본값이 차단이다', () => {
      for (const key of FEATURE_KEYS) {
        const feature = FEATURE_CATALOG[key];
        if (!feature.irreversible) continue;
        expect(feature.defaultEnabled).toBe(false);
      }
    });

    it('카탈로그 키와 FEATURE_KEYS 가 일치한다', () => {
      expect(Object.keys(FEATURE_CATALOG).sort()).toEqual([...FEATURE_KEYS].sort());
    });

    it('모든 기능이 사람이 읽을 이름과 설명을 갖는다', () => {
      for (const key of FEATURE_KEYS) {
        expect(FEATURE_CATALOG[key].name.trim().length).toBeGreaterThan(0);
        expect(FEATURE_CATALOG[key].description.trim().length).toBeGreaterThan(0);
      }
    });

    it('정의의 key 가 카탈로그 키와 같다', () => {
      for (const key of FEATURE_KEYS) {
        expect(FEATURE_CATALOG[key].key).toBe(key);
      }
    });
  });

  describe('기본값', () => {
    // 이미 운영 중인 기능이 배포 한 번으로 사라지면 안 된다.
    it('이미 운영 중이던 packet-capture 만 기본 허용이다', () => {
      const enabledByDefault = FEATURE_KEYS.filter((key) => FEATURE_CATALOG[key].defaultEnabled);

      expect(enabledByDefault).toEqual(['packet-capture']);
    });

    it('이번에 새로 만든 기능은 전부 기본 차단이다', () => {
      for (const key of ['call-analysis', 'ai-insights', 'ars-flow-builder'] as const) {
        expect(FEATURE_CATALOG[key].defaultEnabled).toBe(false);
      }
    });

    it('defaultEnabledMap 이 모든 기능을 담는다', () => {
      const map = defaultEnabledMap();

      expect(Object.keys(map).sort()).toEqual([...FEATURE_KEYS].sort());
      expect(map['packet-capture']).toBe(true);
      expect(map['call-analysis']).toBe(false);
    });
  });

  describe('되돌릴 수 없는 기능', () => {
    it('녹취 암호화만 되돌릴 수 없다', () => {
      const irreversible = FEATURE_KEYS.filter((key) => FEATURE_CATALOG[key].irreversible);

      expect(irreversible).toEqual(['recording-encryption']);
    });
  });

  describe('isFeatureKey', () => {
    it('카탈로그에 있는 키만 통과한다', () => {
      expect(isFeatureKey('call-analysis')).toBe(true);
      expect(isFeatureKey('nope')).toBe(false);
      expect(isFeatureKey(null)).toBe(false);
      expect(isFeatureKey(3)).toBe(false);
    });
  });

  describe('getFeature', () => {
    it('정의를 준다', () => {
      expect(getFeature('packet-capture').menuKeys).toEqual(['system/packet-capture']);
    });

    it('모르는 키는 그 값을 담아 던진다', () => {
      expect(() => getFeature('ghost' as any)).toThrow(/ghost/);
    });
  });

  describe('menuKeysHiddenBy', () => {
    it('자격 없는 기능들의 메뉴 키를 모은다', () => {
      expect(menuKeysHiddenBy(['packet-capture'])).toEqual(['system/packet-capture']);
    });

    it('여러 기능의 메뉴 키를 합치고 중복을 지운다', () => {
      const hidden = menuKeysHiddenBy(['packet-capture', 'call-analysis', 'packet-capture']);

      expect(hidden.sort()).toEqual(['settings/consult-categories', 'system/packet-capture']);
    });

    it('메뉴가 없는 기능은 아무것도 감추지 않는다', () => {
      expect(menuKeysHiddenBy(['recording-encryption', 'ai-insights'])).toEqual([]);
    });

    it('모르는 키는 조용히 무시한다', () => {
      expect(menuKeysHiddenBy(['ghost'])).toEqual([]);
    });

    it('빈 목록이면 감출 것이 없다', () => {
      expect(menuKeysHiddenBy([])).toEqual([]);
    });
  });
});
