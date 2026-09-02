import { requestJson, resolveApiUrl } from './provider-http';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('resolveApiUrl', () => {
  it('전체 경로를 주면 그대로 쓴다', () => {
    expect(resolveApiUrl('http://stt:8000/v1/audio/transcriptions', 'audio/transcriptions'))
      .toBe('http://stt:8000/v1/audio/transcriptions');
  });

  it('버전까지만 준 주소에는 경로를 붙인다', () => {
    expect(resolveApiUrl('https://api.openai.com/v1', 'chat/completions'))
      .toBe('https://api.openai.com/v1/chat/completions');
  });

  it('호스트만 준 주소에는 버전과 경로를 함께 붙인다', () => {
    expect(resolveApiUrl('http://ollama:11434', 'chat/completions'))
      .toBe('http://ollama:11434/v1/chat/completions');
  });

  it('끝의 슬래시를 무시한다', () => {
    expect(resolveApiUrl('https://api.anthropic.com/v1/', 'messages'))
      .toBe('https://api.anthropic.com/v1/messages');
  });
});

describe('requestJson', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('2xx 면 파싱한 본문을 준다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response({ ok: true }));

    await expect(requestJson({ url: 'http://x/y', label: 'local STT', body: {} }))
      .resolves.toEqual({ ok: true });
  });

  it('실패 응답은 상태코드와 본문을 담아 던진다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response('model not found', 404));

    await expect(requestJson({ url: 'http://x/y', label: 'local STT', body: {} }))
      .rejects.toThrow(/local STT returned 404.*model not found/s);
  });

  it('긴 오류 본문은 잘라낸다 — 로그가 통째로 밀리지 않게', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response('x'.repeat(5000), 500));

    const error = await requestJson({ url: 'http://x/y', label: 'openai LLM', body: {} })
      .catch((caught) => caught as Error);

    expect(error.message).toMatch(/openai LLM returned 500/);
    expect(error.message.length).toBeLessThan(600);
  });

  it('시간 초과는 무엇이 얼마나 걸렸는지 알려준다', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(timeout);

    await expect(requestJson({ url: 'http://x/y', label: 'local STT', body: {}, timeoutMs: 1234 }))
      .rejects.toThrow(/local STT timed out after 1234ms/);
  });

  it('JSON 이 아닌 2xx 응답도 프로바이더 이름과 함께 던진다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response('<html>proxy</html>'));

    await expect(requestJson({ url: 'http://x/y', label: 'local LLM', body: {} }))
      .rejects.toThrow(/local LLM returned a non-JSON response/);
  });

  it('body 가 FormData 면 Content-Type 을 직접 넣지 않는다 — boundary 를 fetch 가 만든다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue(response({}));
    const form = new FormData();
    form.append('model', 'whisper-1');

    await requestJson({ url: 'http://x/y', label: 'local STT', body: form });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(form);
    expect(Object.keys(init.headers ?? {})).not.toContain('Content-Type');
  });
});
