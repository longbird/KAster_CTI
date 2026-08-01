import { BadRequestException } from '@nestjs/common';

export type OutboundDialNumberCategory =
  | 'DOMESTIC'
  | 'REPRESENTATIVE'
  | 'PAID'
  | 'INTERNATIONAL'
  | 'UNSUPPORTED';

export interface OutboundDialPermissions {
  phoneDirect: boolean;
  domestic: boolean;
  representative: boolean;
  paid: boolean;
  international: boolean;
}

export const DEFAULT_OUTBOUND_DIAL_PERMISSIONS: OutboundDialPermissions = {
  phoneDirect: false,
  domestic: true,
  representative: true,
  paid: false,
  international: false,
};

export const REPRESENTATIVE_OUTBOUND_DIALPLAN_PATTERNS = [
  '_15XXXXXX',
  '_16XXXXXX',
  '_18XXXXXX',
] as const;

export const INTERNATIONAL_OUTBOUND_DIALPLAN_PATTERNS = ['_00.'] as const;
export const PAID_OUTBOUND_DIALPLAN_PATTERNS = ['_060XXXXXXX', '_060XXXXXXXX'] as const;
export const DOMESTIC_OUTBOUND_DIALPLAN_PATTERNS = ['_0X.'] as const;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeOutboundDialPermissions(input: unknown): OutboundDialPermissions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_OUTBOUND_DIAL_PERMISSIONS };
  }

  const source = input as Partial<OutboundDialPermissions>;
  return {
    ...DEFAULT_OUTBOUND_DIAL_PERMISSIONS,
    phoneDirect: typeof source.phoneDirect === 'boolean'
      ? source.phoneDirect
      : DEFAULT_OUTBOUND_DIAL_PERMISSIONS.phoneDirect,
    domestic: typeof source.domestic === 'boolean' ? source.domestic : DEFAULT_OUTBOUND_DIAL_PERMISSIONS.domestic,
    representative: typeof source.representative === 'boolean'
      ? source.representative
      : DEFAULT_OUTBOUND_DIAL_PERMISSIONS.representative,
    paid: typeof source.paid === 'boolean' ? source.paid : DEFAULT_OUTBOUND_DIAL_PERMISSIONS.paid,
    international: typeof source.international === 'boolean'
      ? source.international
      : DEFAULT_OUTBOUND_DIAL_PERMISSIONS.international,
  };
}

export function extractOutboundDialPermissions(settingsProfile: unknown): OutboundDialPermissions {
  if (!settingsProfile || typeof settingsProfile !== 'object' || Array.isArray(settingsProfile)) {
    return normalizeOutboundDialPermissions(null);
  }

  return normalizeOutboundDialPermissions(
    (settingsProfile as { outboundDialPermissions?: unknown }).outboundDialPermissions,
  );
}

export function classifyOutboundDialNumber(value: string): OutboundDialNumberCategory {
  const raw = value.trim();
  const digits = digitsOnly(raw);

  if (!raw || !digits) {
    return 'UNSUPPORTED';
  }

  if (raw.startsWith('+') || /^00\d{3,}$/.test(digits)) {
    return 'INTERNATIONAL';
  }

  if (/^060\d{7,8}$/.test(digits)) {
    return 'PAID';
  }

  if (/^(15|16|18)\d{6}$/.test(digits)) {
    return 'REPRESENTATIVE';
  }

  if (isAllowedDomesticDialNumber(digits)) {
    return 'DOMESTIC';
  }

  return 'UNSUPPORTED';
}

export function assertOutboundDialAllowed(
  value: string,
  permissionsInput?: Partial<OutboundDialPermissions> | null,
): OutboundDialNumberCategory {
  const permissions = normalizeOutboundDialPermissions(permissionsInput);
  const category = classifyOutboundDialNumber(value);

  if (category === 'INTERNATIONAL') {
    if (permissions.international) return category;
    throw new BadRequestException('해외 발신은 차단되어 있습니다.');
  }
  if (category === 'PAID') {
    if (permissions.paid) return category;
    throw new BadRequestException('유료 번호 발신은 차단되어 있습니다.');
  }
  if (category === 'REPRESENTATIVE') {
    if (permissions.representative) return category;
    throw new BadRequestException('대표번호 발신 권한이 없습니다.');
  }
  if (category === 'DOMESTIC') {
    if (permissions.domestic) return category;
    throw new BadRequestException('국내 일반번호 발신 권한이 없습니다.');
  }

  throw new BadRequestException('허용되지 않은 발신번호 형식입니다.');
}

export function normalizeAllowedOutboundDialNumber(
  value: string,
  permissionsInput?: Partial<OutboundDialPermissions> | null,
): string {
  assertOutboundDialAllowed(value, permissionsInput);
  return digitsOnly(value);
}

export function getBlockedOutboundDialplanPatterns(
  permissionsInput?: Partial<OutboundDialPermissions> | null,
): string[] {
  const permissions = normalizeOutboundDialPermissions(permissionsInput);
  const patterns: string[] = [];

  if (!permissions.international) {
    patterns.push(...INTERNATIONAL_OUTBOUND_DIALPLAN_PATTERNS);
  }
  if (!permissions.paid) {
    patterns.push(...PAID_OUTBOUND_DIALPLAN_PATTERNS);
  }
  if (!permissions.representative) {
    patterns.push(...REPRESENTATIVE_OUTBOUND_DIALPLAN_PATTERNS);
  }
  if (!permissions.domestic) {
    patterns.push(...DOMESTIC_OUTBOUND_DIALPLAN_PATTERNS);
  }

  return patterns;
}

function isAllowedDomesticDialNumber(digits: string): boolean {
  if (/^02\d{7,8}$/.test(digits)) return true;
  if (/^0(3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}$/.test(digits)) return true;
  if (/^0(10|11|16|17|18|19)\d{7,8}$/.test(digits)) return true;
  if (/^070\d{7,8}$/.test(digits)) return true;
  if (/^080\d{7,8}$/.test(digits)) return true;
  return false;
}
