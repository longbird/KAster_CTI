import { OpenAiCompatibleSttProvider } from './openai-compatible-stt.provider';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function providerWith(overrides: Partial<ConstructorParameters<typeof OpenAiCompatibleSttProvider>[0]> = {}) {
  return new OpenAiCompatibleSttProvider({
    name: 'local',
    endpoint: 'http://stt:8000/v1',
    model: 'Systran/faster-whisper-large-v3',
    apiKey: null,
    timeoutMs: 300_000,
    ...overrides,
  });
}

// 8kHz 16bit 모노 1초 = 16000 바이트.
const ONE_SECOND = Buffer.alloc(16_000);

function input(audio = ONE_SECOND) {
  return {
    audio,
    sampleRate: 8000,
    bitsPerSample: 16,
    language: 'ko',
    speaker: 'CUSTOMER' as const,
  };
}

describe('OpenAiCompatibleSttProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('멀티파트로 파일·모델·언어를 보낸다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(response({ text: '안녕하세요', segments: [] }));

    await providerWith().transcribe(input());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://stt:8000/v1/audio/transcriptions');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('Systran/faster-whisper-large-v3');
    expect(form.get('language')).toBe('ko');
    expect(form.get('response_format')).toBe('verbose_json');
    expect((form.get('file') as Blob).size).toBe(ONE_SECOND.length);
  });

  it('API 키가 있을 때만 Authorization 을 붙인다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValue(response({ text: '', segments: [] }));

    await providerWith().transcribe(input());
    await providerWith({ apiKey: 'sk-test' }).transcribe(input());

    const withoutKey = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const withKey = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(withoutKey.Authorization).toBeUndefined();
    expect(withKey.Authorization).toBe('Bearer sk-test');
  });

  it('세그먼트의 초 단위 시각을 ms 로 바꾼다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response({
      text: '안녕하세요 반갑습니다',
      segments: [
        { start: 0, end: 1.25, text: ' 안녕하세요', avg_logprob: -0.1 },
        { start: 1.25, end: 2.5, text: '반갑습니다 ', avg_logprob: -0.2 },
      ],
    }));

    const result = await providerWith().transcribe(input());

    expect(result.segments).toEqual([
      { speaker: 'CUSTOMER', startMs: 0, endMs: 1250, text: '안녕하세요', confidence: expect.closeTo(0.905, 2) },
      { speaker: 'CUSTOMER', startMs: 1250, endMs: 2500, text: '반갑습니다', confidence: expect.closeTo(0.819, 2) },
    ]);
    expect(result.text).toBe('안녕하세요 반갑습니다');
    expect(result.modelName).toBe('Systran/faster-whisper-large-v3');
  });

  it('세그먼트를 안 주는 서버면 전체 길이 한 구간으로 만든다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response({ text: '한 문장입니다' }));

    const result = await providerWith().transcribe(input(Buffer.alloc(32_000)));

    expect(result.segments).toEqual([
      { speaker: 'CUSTOMER', startMs: 0, endMs: 2000, text: '한 문장입니다' },
    ]);
  });

  it('무음이면 빈 결과를 준다 — 분석 단계가 이 통화를 건너뛴다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response({ text: '   ', segments: [] }));

    const result = await providerWith().transcribe(input());

    expect(result.text).toBe('');
    expect(result.segments).toEqual([]);
  });

  it('전체 신뢰도는 세그먼트 신뢰도의 평균이다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response({
      text: 'a b',
      segments: [
        { start: 0, end: 1, text: 'a', avg_logprob: 0 },
        { start: 1, end: 2, text: 'b', avg_logprob: Math.log(0.5) },
      ],
    }));

    const result = await providerWith().transcribe(input());

    expect(result.confidence).toBeCloseTo(0.75, 3);
  });

  it('오류에 프로바이더 이름이 들어간다', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(response('no model loaded', 400));

    await expect(providerWith().transcribe(input())).rejects.toThrow(/local STT returned 400/);
  });
});
