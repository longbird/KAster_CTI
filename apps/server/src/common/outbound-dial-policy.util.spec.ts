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
    it('예전 boolean 을 읽는다 — 체크 해제(false)는 명시적 차단이다', () => {
      // 배포 순간 사이트 기본값이 '허용'이면 예전 상담원이 한꺼번에 열린다.
      // 그래서 false 를 INHERIT 가 아니라 DENY 로 읽는다.
      expect(normalizeOutboundDialPermissions({ phoneDirect: false }).phoneDirect).toBe('DENY');
      expect(normalizeOutboundDialPermissions({ phoneDirect: true }).phoneDirect).toBe('ALLOW');
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
