import { BadRequestException } from '@nestjs/common';

export function normalizeCallerId(value: string): string {
  const normalized = value.replace(/\D/g, '');
  if (!/^\d{8,16}$/.test(normalized)) {
    throw new BadRequestException('발신번호는 8~16자리 숫자여야 합니다.');
  }
  return normalized;
}

export function parseAllowedCallerIds(value?: string | null): string[] {
  if (!value) return [];
  return [...new Set(
    value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map(normalizeCallerId),
  )];
}

export function serializeAllowedCallerIds(values: string[]): string | null {
  if (values.length === 0) return null;
  return values.join('\n');
}
