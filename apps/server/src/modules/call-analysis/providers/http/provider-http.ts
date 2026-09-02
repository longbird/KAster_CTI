const DEFAULT_TIMEOUT_MS = 120_000;
const ERROR_BODY_MAX_CHARS = 400;

export interface RequestJsonInput {
  url: string;
  /** 오류 메시지에 붙는 이름. 어느 프로바이더가 죽었는지 로그만 보고 알 수 있어야 한다. */
  label: string;
  body: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * 프로바이더가 쓰는 HTTP 왕복 한 번.
 *
 * 세 가지를 여기서 한 번에 처리한다 — 어댑터마다 다르게 처리하면 장애 때 로그 모양이 갈린다.
 * 1) 타임아웃. STT 사이드카가 멈추면 sweep 이 통째로 막힌다.
 * 2) 실패 응답을 상태코드 + 본문 앞부분으로 정규화. 본문은 잘라 넣는다.
 * 3) JSON 이 아닌 응답(프록시 HTML 등)도 같은 모양의 오류로.
 */
export async function requestJson<T = any>(input: RequestJsonInput): Promise<T> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const isForm = typeof FormData !== 'undefined' && input.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(input.url, {
      method: 'POST',
      // FormData 는 Content-Type 을 직접 넣으면 안 된다 — boundary 를 fetch 가 붙인다.
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(input.headers ?? {}),
      },
      body: isForm ? (input.body as FormData) : JSON.stringify(input.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new Error(`${input.label} timed out after ${timeoutMs}ms`);
    }
    throw new Error(`${input.label} request failed: ${describe(error)}`);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${input.label} returned ${response.status}: ${truncate(text)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${input.label} returned a non-JSON response: ${truncate(text)}`);
  }
}

/**
 * 설정된 주소를 실제 호출 주소로 맞춘다.
 *
 * 운영자가 `http://host:8000`, `.../v1`, `.../v1/chat/completions` 중 무엇을 적어도 동작해야 한다.
 * 셋 다 흔한 표기라 하나만 받으면 조용히 404 를 맞는다.
 */
export function resolveApiUrl(endpoint: string, path: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (trimmed.endsWith(`/${path}`)) return trimmed;
  if (/\/v\d+$/.test(trimmed)) return `${trimmed}/${path}`;
  return `${trimmed}/v1/${path}`;
}

/**
 * 시간 초과 판별.
 *
 * 두 가지를 함께 넘긴다.
 * 1) undici 는 타임아웃을 다른 오류로 감싸고 진짜 원인을 `cause` 에 넣는다 — 원인을 따라 내려간다.
 * 2) 던져지는 것이 `DOMException` 이라 realm 이 다르면 `instanceof Error` 가 거짓이다 (jest 에서 실측).
 *    그래서 타입이 아니라 `name` 을 본다.
 */
function isTimeout(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const node = current as { name?: unknown; cause?: unknown };
    if (node.name === 'TimeoutError' || node.name === 'AbortError') return true;
    current = node.cause;
  }
  return false;
}

/** `instanceof Error` 를 쓰지 않는다 — 위와 같은 이유로 realm 이 다르면 거짓이 된다. */
function describe(error: unknown): string {
  const node = error as { message?: unknown };
  return typeof node?.message === 'string' ? node.message : String(error);
}

function truncate(text: string): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > ERROR_BODY_MAX_CHARS ? `${flat.slice(0, ERROR_BODY_MAX_CHARS)}...` : flat;
}
