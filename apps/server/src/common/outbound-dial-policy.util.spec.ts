import { BadRequestException } from '@nestjs/common';
import {
  assertOutboundDialAllowed,
  classifyOutboundDialNumber,
  getBlockedOutboundDialplanPatterns,
  normalizeOutboundDialPermissions,
  normalizeAllowedOutboundDialNumber,
} from './outbound-dial-policy.util';

describe('outbound-dial-policy.util', () => {
  it('defaults phone direct dialing to disabled while client-originated domestic and representative calls are allowed', () => {
    expect(normalizeOutboundDialPermissions(null)).toMatchObject({
      phoneDirect: false,
      domestic: true,
      representative: true,
      paid: false,
      international: false,
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
