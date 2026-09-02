import { OpenAiCompatibleLlmProvider } from './openai-compatible-llm.provider';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function providerWith(overrides: Partial<ConstructorParameters<typeof OpenAiCompatibleLlmProvider>[0]> = {}) {
  return new OpenAiCompatibleLlmProvider({
    name: 'openai',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'sk-test',
    timeoutMs: 120_000,
    ...overrides,
  });
}

const INPUT = { system: '너는 분석기다', user: '전문...', maxTokens: 800 };

describe('OpenAiCompatibleLlmProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('system 과 user 를 messages 로 보낸다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(response({ choices: [{ message: { content: '{}' } }] }));

    await providerWith().complete(INPUT);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      messages: [
        { role: 'system', content: '너는 분석기다' },
        { role: 'user', content: '전문...' },
      ],
    });
  });

  it('json 을 요구하면 response_format 을 붙인다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(response({ choices: [{ message: { content: '{}' } }] }));

    await providerWith().complete({ ...INPUT, responseFormat: 'json' });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('json 을 요구하지 않으면 response_format 을 넣지 않는다 — 지원 안 하는 서버가 400 을 낸다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(response({ choices: [{ message: { content: 'hi' } }] }));

    await providerWith().complete(INPUT);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('response_format');
  });

  it('키 없는 로컬 서버에는 Authorization 을 붙이지 않는다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(response({ choices: [{ message: { content: '{}' } }] }));

    await providerWith({ name: 'local', endpoint: 'http://vllm:8000', apiKey: null }).complete(INPUT);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://vllm:8000/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('응답 본문과 실제 사용된 모델명을 돌려준다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response({
      model: 'gpt-4o-mini-2024-07-18',
      choices: [{ message: { content: '{"summary":"요약"}' } }],
    }));

    await expect(providerWith().complete(INPUT)).resolves.toEqual({
      text: '{"summary":"요약"}',
      modelName: 'gpt-4o-mini-2024-07-18',
    });
  });

  it('선택지가 비면 던진다 — 빈 문자열을 파서로 흘리지 않는다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response({ choices: [] }));

    await expect(providerWith().complete(INPUT)).rejects.toThrow(/openai LLM returned no completion/);
  });
});
