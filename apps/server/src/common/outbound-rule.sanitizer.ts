import { BadRequestException } from '@nestjs/common';

export type OutboundMatchType = 'EXACT' | 'PREFIX' | 'REGEX' | 'DIALPLAN_PATTERN';

const PATTERNS: Record<OutboundMatchType, RegExp> = {
  EXACT: /^[0-9+]{1,20}$/,
  PREFIX: /^[0-9+]{1,20}$/,
  // REGEX: 길이만 검증. RegExp 컴파일은 별도로 시도해 invalid 시 422 처리.
  REGEX: /^.{1,200}$/s,
  DIALPLAN_PATTERN: /^_[0-9NXZ.\[\]\-]{1,32}$/,
};

const CALLER_ID_PATTERN = /^[0-9+]{1,20}$/;
const DISPLAY_NAME_PATTERN = /^[\w\s.\-가-힣]{0,40}$/;
const ASSERT_NO_NEWLINES = /[\r\n]/;

/**
 * 아웃바운드 룰의 sourceNumberPattern 을 matchType 에 따라 검증한다.
 * 위반 시 BadRequestException — controller DTO 에서 1차 검증되더라도 service 진입 시 다시 한 번 강제.
 */
export function validateSourceNumberPattern(
  matchType: OutboundMatchType,
  pattern: string,
): void {
  if (typeof pattern !== 'string') {
    throw new BadRequestException('sourceNumberPattern 은 문자열이어야 합니다.');
  }
  if (ASSERT_NO_NEWLINES.test(pattern)) {
    throw new BadRequestException('sourceNumberPattern 에 개행을 포함할 수 없습니다.');
  }
  const allowed = PATTERNS[matchType];
  if (!allowed) {
    throw new BadRequestException(`알 수 없는 matchType: ${matchType}`);
  }
  if (!allowed.test(pattern)) {
    throw new BadRequestException(
      `sourceNumberPattern 형식이 matchType=${matchType} 규칙에 맞지 않습니다.`,
    );
  }
  if (matchType === 'REGEX') {
    try {
      // RegExp 컴파일이 가능한지만 확인. 실제 매칭은 service 가 사용한다.
      // u 플래그는 한국어 등 유니코드 안전.
      // eslint-disable-next-line no-new
      new RegExp(pattern, 'u');
    } catch (err: any) {
      throw new BadRequestException(`REGEX 컴파일 실패: ${err?.message ?? 'invalid regex'}`);
    }
  }
}

/** dialplan 으로 흘러갈 callerIdNumber 안전성 검증 */
export function validateCallerIdNumber(value: string): void {
  if (typeof value !== 'string' || !CALLER_ID_PATTERN.test(value)) {
    throw new BadRequestException('callerIdNumber 는 숫자/+ 만 1~20자 허용합니다.');
  }
}

/** dialplan 의 caller name 으로 들어갈 수 있는 displayName 안전성 검증 */
export function validateDisplayName(value: string | null | undefined): void {
  if (value == null || value === '') return;
  if (ASSERT_NO_NEWLINES.test(value)) {
    throw new BadRequestException('displayName 에 개행을 포함할 수 없습니다.');
  }
  if (!DISPLAY_NAME_PATTERN.test(value)) {
    throw new BadRequestException(
      'displayName 은 한글/영숫자/공백/.- 만 허용합니다 (최대 40자).',
    );
  }
}

/**
 * 입력 번호가 룰의 sourceNumberPattern 에 매칭되는지 평가.
 * dialplan 측 매칭과 별개로 서버 측 미리보기/테스트 용도.
 */
export function matchSourceNumber(
  matchType: OutboundMatchType,
  pattern: string,
  inputNumber: string,
): boolean {
  switch (matchType) {
    case 'EXACT':
      return inputNumber === pattern;
    case 'PREFIX':
      return inputNumber.startsWith(pattern);
    case 'REGEX':
      try {
        return new RegExp(pattern, 'u').test(inputNumber);
      } catch {
        return false;
      }
    case 'DIALPLAN_PATTERN':
      return matchAsteriskPattern(pattern, inputNumber);
  }
}

/** Asterisk 패턴(_NXX 형태) 단순 매처 — N=2-9, X=0-9, Z=1-9, [chars]=set, .=한 자릿수 이상, -=무시. */
function matchAsteriskPattern(pattern: string, value: string): boolean {
  if (!pattern.startsWith('_')) return pattern === value;
  const body = pattern.slice(1).replace(/-/g, '');
  let i = 0;
  let v = 0;
  while (i < body.length && v < value.length) {
    const c = body[i];
    const ch = value[v];
    if (c === 'N') {
      if (!/[2-9]/.test(ch)) return false;
      i++;
      v++;
      continue;
    }
    if (c === 'X') {
      if (!/[0-9]/.test(ch)) return false;
      i++;
      v++;
      continue;
    }
    if (c === 'Z') {
      if (!/[1-9]/.test(ch)) return false;
      i++;
      v++;
      continue;
    }
    if (c === '[') {
      const end = body.indexOf(']', i);
      if (end < 0) return false;
      const set = body.slice(i + 1, end);
      if (!new RegExp(`[${set}]`).test(ch)) return false;
      i = end + 1;
      v++;
      continue;
    }
    if (c === '.') {
      // 한 자릿수 이상 어떤 숫자든
      return /^[0-9]+$/.test(value.slice(v));
    }
    if (c === ch) {
      i++;
      v++;
      continue;
    }
    return false;
  }
  return i === body.length && v === value.length;
}
