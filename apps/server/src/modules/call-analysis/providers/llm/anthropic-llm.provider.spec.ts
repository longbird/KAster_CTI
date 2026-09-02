import { AnthropicLlmProvider } from './anthropic-llm.provider';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function providerWith() {
  return new AnthropicLlmProvider({
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-5',
    apiKey: 'sk-ant-test',
    timeoutMs: 120_000,
  });
}

const INPUT = { system: '너는 분석기다', user: '전문...', maxTokens: 800 };

describe('AnthropicLlmProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('x-api-key 와 버전 헤더를 보낸다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(response({ content: [{ type: 'text', text: '{}' }] }));

    await providerWith().complete(INPUT);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers.Authorization).toBeUndefined();
  });

  it('system 은 messages 가 아니라 최상위로 보낸다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(response({ content: [{ type: 'text', text: '{}' }] }));

    await providerWith().complete(INPUT);

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 800,
      system: '너는 분석기다',
      messages: [{ role: 'user', content: '전문...' }],
    });
  });

  it('텍스트 블록을 이어 붙인다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response({
      model: 'claude-sonnet-5-20260101',
      content: [
        { type: 'thinking', thinking: '무시' },
        { type: 'text', text: '{"summary":' },
        { type: 'text', text: '"요약"}' },
      ],
    }));

    await expect(providerWith().complete(INPUT)).resolves.toEqual({
      text: '{"summary":"요약"}',
      modelName: 'claude-sonnet-5-20260101',
    });
  });

  it('텍스트 블록이 없으면 던진다', async () => {
    jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(response({ content: [{ type: 'thinking', thinking: '...' }] }));

    await expect(providerWith().complete(INPUT)).rejects.toThrow(/anthropic LLM returned no completion/);
  });

  it('오류에 프로바이더 이름이 들어간다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response('overloaded', 529));

    await expect(providerWith().complete(INPUT)).rejects.toThrow(/anthropic LLM returned 529/);
  });
});
