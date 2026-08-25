import { BadRequestException } from '@nestjs/common';
import {
  assertOutboundDialAllowed,
  classifyOutboundDialNumber,
  getBlockedOutboundDialplanPatterns,
  normalizeOutboundDialPermissions,
  normalizeAllowedOutboundDialNumber,
  resolvePhoneDirectAllowed,
} from './outbound-dial-policy.util';

describe('outbound-dial-policy.util', () => {
  it('defaults phone direct dialing to site default while client-originated domestic and representative calls are allowed', () => {
    expect(normalizeOutboundDialPermissions(null)).toMatchObject({
      phoneDirect: 'INHERIT',
      phoneDirectAllowedIps: [],
      domestic: true,
      representative: true,
      paid: false,
      international: false,
    });
  });

  it('normalizes phone direct source IP allowlist and drops invalid values', () => {
    expect(normalizeOutboundDialPermissions({
      phoneDirect: 'ALLOW',
      phoneDirectAllowedIps: ['203.0.113.10', '203.0.113.10', '10.0.0.0/24', '999.1.1.1', 'bad'],
    }).phoneDirectAllowedIps).toEqual(['203.0.113.10', '10.0.0.0/24']);
  });

  describe('phoneDirect 3상태', () => {
    it('예전 boolean 은 그 값이 실제로 만들던 동작으로 옮긴다', () => {
      // 예전 판정식은 `사이트 AND phoneDirect AND 허용IP있음` 이었다.
      // 체크만 켜고 IP 가 비어 있던 상담원은 <b>한 번도 발신한 적이 없다</b> — DENY 다.
      // 2026-08-25 에 이걸 ALLOW 로 옮겼다가 운영에서 전 내선이 열렸다.
      expect(normalizeOutboundDialPermissions({ phoneDirect: true }).phoneDirect).toBe('DENY');
      expect(normalizeOutboundDialPermissions({
        phoneDirect: true,
        phoneDirectAllowedIps: [],
      }).phoneDirect).toBe('DENY');
      expect(normalizeOutboundDialPermissions({ phoneDirect: false }).phoneDirect).toBe('DENY');
      expect(normalizeOutboundDialPermissions({
        phoneDirect: false,
        phoneDirectAllowedIps: ['203.0.113.10'],
      }).phoneDirect).toBe('DENY');
    });

    it('예전에 실제로 발신하던 상담원(체크 + 허용IP)은 사이트 값을 그대로 따른다', () => {
      // 예전에도 사이트 스위치가 이 상담원을 좌우했다. 그 관계를 그대로 옮긴 값이 INHERIT 다.
      expect(normalizeOutboundDialPermissions({
        phoneDirect: true,
        phoneDirectAllowedIps: ['203.0.113.10'],
      }).phoneDirect).toBe('INHERIT');
    });

    it('예전 값 어디에도 ALLOW 가 나오지 않는다 — 배포가 아무 내선도 열지 않는다', () => {
      const legacy = [
        { phoneDirect: true },
        { phoneDirect: false },
        { phoneDirect: true, phoneDirectAllowedIps: [] },
        { phoneDirect: true, phoneDirectAllowedIps: ['203.0.113.10'] },
        { phoneDirect: false, phoneDirectAllowedIps: ['203.0.113.10'] },
        {},
      ];
      for (const stored of legacy) {
        expect(normalizeOutboundDialPermissions(stored).phoneDirect).not.toBe('ALLOW');
      }
    });

    it('새로 저장한 3상태 값은 그대로 읽는다', () => {
      expect(normalizeOutboundDialPermissions({ phoneDirect: 'ALLOW' }).phoneDirect).toBe('ALLOW');
      expect(normalizeOutboundDialPermissions({ phoneDirect: 'DENY' }).phoneDirect).toBe('DENY');
    });

    it('알 수 없는 값과 미설정은 상속이다', () => {
      expect(normalizeOutboundDialPermissions({}).phoneDirect).toBe('INHERIT');
      expect(normalizeOutboundDialPermissions({ phoneDirect: 'nonsense' }).phoneDirect).toBe('INHERIT');
      expect(normalizeOutboundDialPermissions({ phoneDirect: 'INHERIT' }).phoneDirect).toBe('INHERIT');
    });

    it('개별 허용은 사이트 차단을 이긴다 — 이 기능의 목적', () => {
      expect(resolvePhoneDirectAllowed('ALLOW', false)).toBe(true);
    });

    it('개별 차단은 사이트 허용을 이긴다', () => {
      expect(resolvePhoneDirectAllowed('DENY', true)).toBe(false);
    });

    it('상속은 사이트 값을 그대로 따른다', () => {
      expect(resolvePhoneDirectAllowed('INHERIT', true)).toBe(true);
      expect(resolvePhoneDirectAllowed('INHERIT', false)).toBe(false);
    });
  });

  it('allows normalized domestic public phone numbers', () => {
    expect(normalizeAllowedOutboundDialNumber('010-1234-5678')).toBe('01012345678');
    expect(normalizeAllowedOutboundDialNumber('02-1234-5678')).toBe('0212345678');
    expect(normalizeAllowedOutboundDialNumber('070-5234-6380')).toBe('07052346380');
    expect(normalizeAllowedOutboundDialNumber('1577-1577')).toBe('15771577');
  });

  it('blocks international dialing formats and carrier prefixes', () => {
    expect(classifyOutboundDialNumber('+81-3-1234-5678')).toBe('INTERNATIONAL');
    expect(classifyOutboundDialNumber('00181312345678')).toBe('INTERNATIONAL');
    expect(() => normalizeAllowedOutboundDialNumber('00281312345678')).toThrow(BadRequestException);
  });

  it('separates paid service numbers from representative numbers', () => {
    expect(classifyOutboundDialNumber('0601234567')).toBe('PAID');
    expect(classifyOutboundDialNumber('15771577')).toBe('REPRESENTATIVE');
    expect(classifyOutboundDialNumber('16881688')).toBe('REPRESENTATIVE');
    expect(classifyOutboundDialNumber('18001234')).toBe('REPRESENTATIVE');
  });

  it('uses agent permissions for category-level outbound decisions', () => {
    expect(() => assertOutboundDialAllowed('15771577')).not.toThrow();
    expect(() => assertOutboundDialAllowed('15771577', { representative: false })).toThrow('대표번호 발신 권한이 없습니다.');
    expect(() => assertOutboundDialAllowed('0601234567')).toThrow('유료 번호 발신은 차단되어 있습니다.');
    expect(() => assertOutboundDialAllowed('0601234567', { paid: true })).not.toThrow();
  });

  it('rejects unsupported short or non-domestic public numbers', () => {
    expect(classifyOutboundDialNumber('1001')).toBe('UNSUPPORTED');
    expect(classifyOutboundDialNumber('821012345678')).toBe('UNSUPPORTED');
  });

  it('builds PBX block patterns from permissions', () => {
    expect(getBlockedOutboundDialplanPatterns()).toContain('_00.');
    expect(getBlockedOutboundDialplanPatterns()).toContain('_060XXXXXXX');
    expect(getBlockedOutboundDialplanPatterns()).not.toContain('_15XXXXXX');
    expect(getBlockedOutboundDialplanPatterns({ representative: false })).toContain('_15XXXXXX');
    expect(getBlockedOutboundDialplanPatterns({ paid: true, international: true })).toEqual([]);
  });
});
