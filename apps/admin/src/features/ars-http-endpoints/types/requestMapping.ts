import type { LookupOutcome } from '../api/arsHttpEndpointsApi';

export const LITERAL_PREFIX = 'LITERAL:';

/**
 * 보낼 수 있는 값의 전부.
 *
 * 서버가 받는 목록과 1:1 이다 (`request-mapping.util.ts`). 자유 템플릿을 두지 않는 이유는
 * 템플릿 언어 자체가 주입 표면이기 때문이다 — 화면에서도 고르게만 한다.
 */
export const REQUEST_SOURCE_OPTIONS = [
  { value: 'CALLER', label: '발신번호' },
  { value: 'COLLECTED', label: '입력받은 번호' },
  { value: 'ENTRY_DID', label: '대표번호' },
  { value: 'LINKEDID', label: '통화 ID' },
  { value: 'LITERAL', label: '고정값' },
] as const;

export type RequestSource = (typeof REQUEST_SOURCE_OPTIONS)[number]['value'];

export interface MappingRow {
  name: string;
  source: RequestSource;
  /** `source === 'LITERAL'` 일 때만 쓴다. */
  literal: string;
}

export function toMappingRows(mapping: Record<string, string> | null | undefined): MappingRow[] {
  if (!mapping || typeof mapping !== 'object') return [];

  return Object.entries(mapping).map(([name, raw]) => (
    raw?.startsWith(LITERAL_PREFIX)
      ? { name, source: 'LITERAL' as const, literal: raw.slice(LITERAL_PREFIX.length) }
      : { name, source: (raw as RequestSource) ?? 'CALLER', literal: '' }
  ));
}

/** 이름이 빈 줄은 버린다 — 편집 중 만들어진 빈 줄까지 서버로 보낼 이유가 없다. */
export function toMappingObject(rows: MappingRow[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const row of rows ?? []) {
    const name = (row?.name ?? '').trim();
    if (!name) continue;
    mapping[name] = row.source === 'LITERAL' ? `${LITERAL_PREFIX}${row.literal ?? ''}` : row.source;
  }
  return mapping;
}

export interface OutcomeSummary {
  tone: 'success' | 'warning' | 'error';
  title: string;
  detail: string;
}

/** 테스트 호출 결과를 사람이 읽는 한 줄로. 무엇이 왜 그렇게 됐는지까지 말한다. */
export function describeOutcome(outcome: LookupOutcome): OutcomeSummary {
  const timing = `${outcome.durationMs}ms`;
  const http = outcome.httpStatus ? ` · HTTP ${outcome.httpStatus}` : '';

  if (outcome.status === 'MATCH') {
    return {
      tone: 'success',
      title: `조건에 맞습니다 (${timing}${http})`,
      detail: `꺼낸 값: ${outcome.value}`,
    };
  }

  if (outcome.status === 'NOMATCH') {
    return {
      tone: 'warning',
      title: `조건에 맞지 않습니다 (${timing}${http})`,
      detail: '통화는 실패 연결로 흐릅니다. 조회 자체는 정상입니다.',
    };
  }

  return {
    tone: 'error',
    title: `조회에 실패했습니다 (${timing}${http})`,
    detail: outcome.reason ?? '원인을 알 수 없습니다.',
  };
}
