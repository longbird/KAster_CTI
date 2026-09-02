/**
 * 외부 응답에서 값을 꺼내 판정한다.
 *
 * **여기가 이 기능에서 가장 위험한 지점이다.** 꺼낸 값은 채널 변수에 들어가고 이후
 * `Goto`·`Playback`·`System()` 인자로 흘러갈 수 있다 — 즉 외부 시스템이 우리 dialplan 에
 * 문자열을 넣는 첫 경로다. 그래서 꺼내는 즉시 깎고, 통과 못 하면 **자르지 않고 거부**한다.
 * 잘린 값은 다른 값이다.
 */

export type LookupStatus = 'MATCH' | 'NOMATCH' | 'ERROR';
export type MatchMode = 'EXISTS' | 'EQUALS' | 'IN';

const MAX_VALUE_LENGTH = 64;
// 영숫자·한글·`_`·`-`·`.` 만. 공백도 받지 않는다 — dialplan 인자 경계가 공백이다.
const ALLOWED_VALUE = /^[\p{L}\p{N}_.-]+$/u;

export interface ExtractLookupInput {
  body: unknown;
  resultPath: string;
  matchMode: MatchMode;
  matchValue: string | null;
}

export interface ExtractLookupResult {
  status: LookupStatus;
  value: string;
  reason?: string;
}

// tsconfig 가 strict:false 라 판별 유니온 좁히기를 믿을 수 없다. 한 모양으로 둔다.
export interface SanitizeResult {
  ok: boolean;
  value?: string;
  reason?: string;
}

export function sanitizeLookupValue(raw: unknown): SanitizeResult {
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
    return { ok: false, reason: 'lookup value must be a string, number or boolean' };
  }

  const value = String(raw);
  if (value.length > MAX_VALUE_LENGTH) {
    return { ok: false, reason: `lookup value is longer than ${MAX_VALUE_LENGTH} characters` };
  }
  if (!ALLOWED_VALUE.test(value)) {
    return { ok: false, reason: 'lookup value contains characters that are not allowed in a dialplan variable' };
  }

  return { ok: true, value };
}

export function extractLookupResult(input: ExtractLookupInput): ExtractLookupResult {
  if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) {
    return { status: 'ERROR', value: '', reason: 'response body is not a JSON object' };
  }

  const picked = pickByPath(input.body as Record<string, unknown>, input.resultPath);
  // 경로가 없는 것은 오류가 아니다 — "그 고객이 없다" 는 정상 결과다.
  if (picked === undefined || picked === null) {
    return { status: 'NOMATCH', value: '' };
  }

  const sanitized = sanitizeLookupValue(picked);
  if (!sanitized.ok) {
    return { status: 'ERROR', value: '', reason: sanitized.reason };
  }

  const value = sanitized.value ?? '';
  return matches(value, input.matchMode, input.matchValue)
    ? { status: 'MATCH', value }
    // 분기하지 않는 값을 채널에 남기지 않는다.
    : { status: 'NOMATCH', value: '' };
}

/** 점 표기만 받는다. 배열 인덱스도 JSONPath 도 없다 — 표현이 늘수록 틀릴 곳이 는다. */
function pickByPath(body: Record<string, unknown>, path: string): unknown {
  let current: unknown = body;

  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function matches(value: string, mode: MatchMode, matchValue: string | null): boolean {
  if (mode === 'EXISTS') return true;
  if (matchValue === null) return false;
  if (mode === 'EQUALS') return value === matchValue.trim();

  return matchValue
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .includes(value);
}
