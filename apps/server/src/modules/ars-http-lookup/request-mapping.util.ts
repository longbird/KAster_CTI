/**
 * 외부에 무엇을 보낼지 조립한다.
 *
 * `{{ }}` 같은 자유 템플릿을 두지 않는다 — 템플릿 언어는 그 자체가 주입 표면이고,
 * 통화 경로에서 그것을 안전하게 만드는 비용이 얻는 것보다 크다.
 * 대신 **정해진 다섯 가지 출처**에서 고른다.
 */

export const REQUEST_SOURCES = ['CALLER', 'COLLECTED', 'ENTRY_DID', 'LINKEDID'] as const;
export const LITERAL_PREFIX = 'LITERAL:';

const PARAM_NAME = /^[A-Za-z0-9_.-]{1,64}$/;

export interface LookupVariables {
  caller: string;
  collected: string;
  entryDid: string;
  linkedid: string;
}

export interface AppliedRequest {
  url: string;
  body?: string;
}

export function buildRequestParams(mapping: unknown, vars: LookupVariables): Record<string, string> {
  if (mapping === null || mapping === undefined) return {};
  if (typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('requestMapping must be an object');
  }

  const params: Record<string, string> = {};
  for (const [name, source] of Object.entries(mapping as Record<string, unknown>)) {
    if (!PARAM_NAME.test(name)) {
      throw new Error(`requestMapping has an invalid parameter name: ${name}`);
    }
    params[name] = resolveSource(source, vars);
  }
  return params;
}

function resolveSource(source: unknown, vars: LookupVariables): string {
  if (typeof source !== 'string') {
    throw new Error('requestMapping values must be strings');
  }
  if (source.startsWith(LITERAL_PREFIX)) {
    return source.slice(LITERAL_PREFIX.length);
  }

  switch (source) {
    case 'CALLER':
      return vars.caller;
    case 'COLLECTED':
      return vars.collected;
    case 'ENTRY_DID':
      return vars.entryDid;
    case 'LINKEDID':
      return vars.linkedid;
    default:
      throw new Error(`unknown requestMapping source: ${source}`);
  }
}

export function applyRequest(
  url: URL,
  method: 'GET' | 'POST',
  params: Record<string, string>,
): AppliedRequest {
  if (method === 'POST') {
    return { url: url.toString(), body: JSON.stringify(params) };
  }

  // 원래 주소에 있던 쿼리는 그대로 두고 뒤에 붙인다.
  const target = new URL(url.toString());
  for (const [name, value] of Object.entries(params)) {
    target.searchParams.append(name, value);
  }
  return { url: target.toString() };
}
