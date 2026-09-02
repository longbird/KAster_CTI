import { FakeLlmProvider } from './fake-llm.provider';
import { FakeSttProvider } from './fake-stt.provider';

describe('FakeSttProvider', () => {
  const provider = new FakeSttProvider();

  it('요청한 화자 라벨을 그대로 붙인 세그먼트를 돌려준다', async () => {
    const result = await provider.transcribe({
      audio: Buffer.alloc(16000 * 2),
      sampleRate: 8000,
      bitsPerSample: 16,
      language: 'ko',
      speaker: 'CUSTOMER',
    });

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.segments.every((segment) => segment.speaker === 'CUSTOMER')).toBe(true);
    expect(result.text).toContain('CUSTOMER');
  });

  it('오디오 길이에서 통화 길이를 계산해 세그먼트 끝 시각을 맞춘다', async () => {
    // 8000Hz · 16bit 모노 2초 = 32000 바이트
    const result = await provider.transcribe({
      audio: Buffer.alloc(32000),
      sampleRate: 8000,
      bitsPerSample: 16,
      language: 'ko',
      speaker: 'AGENT',
    });

    expect(result.segments[result.segments.length - 1].endMs).toBe(2000);
  });

  it('빈 오디오는 세그먼트 없이 빈 전문을 돌려준다', async () => {
    const result = await provider.transcribe({
      audio: Buffer.alloc(0),
      sampleRate: 8000,
      bitsPerSample: 16,
      language: 'ko',
      speaker: 'UNKNOWN',
    });

    expect(result.text).toBe('');
    expect(result.segments).toEqual([]);
  });
});

describe('FakeLlmProvider', () => {
  const provider = new FakeLlmProvider();

  it('분석 서비스가 파싱할 수 있는 JSON 을 돌려준다', async () => {
    const result = await provider.complete({
      system: 'system',
      user: '고객이 배송 지연을 문의했고 상담원이 재배송을 안내했다.',
      maxTokens: 512,
      responseFormat: 'json',
    });

    const parsed = JSON.parse(result.text);
    expect(typeof parsed.summary).toBe('string');
    expect(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).toContain(parsed.sentiment);
    expect(Array.isArray(parsed.keywords)).toBe(true);
  });

  it('같은 입력에는 같은 결과를 준다', async () => {
    const input = { system: 's', user: 'u', maxTokens: 128, responseFormat: 'json' as const };

    const first = await provider.complete(input);
    const second = await provider.complete(input);

    expect(first.text).toBe(second.text);
  });
});
