import { ConfigService } from '@nestjs/config';
import { CallAnalysisProviderFactory } from './provider.factory';

function factoryWith(env: Record<string, string>) {
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;
  return new CallAnalysisProviderFactory(config);
}

describe('CallAnalysisProviderFactory', () => {
  describe('stt()', () => {
    it('fake 프로바이더를 만든다', () => {
      const provider = factoryWith({ CALL_ANALYSIS_STT_PROVIDER: 'fake' }).stt();

      expect(provider.name).toBe('fake');
      expect(typeof provider.transcribe).toBe('function');
    });

    it('대소문자와 앞뒤 공백을 무시한다', () => {
      expect(factoryWith({ CALL_ANALYSIS_STT_PROVIDER: '  FAKE ' }).stt().name).toBe('fake');
    });

    it('같은 인스턴스를 재사용한다', () => {
      const factory = factoryWith({ CALL_ANALYSIS_STT_PROVIDER: 'fake' });

      expect(factory.stt()).toBe(factory.stt());
    });

    it('설정이 비어 있으면 어떤 env 를 채워야 하는지 알려준다', () => {
      expect(() => factoryWith({}).stt()).toThrow(/CALL_ANALYSIS_STT_PROVIDER/);
    });

    it('모르는 값이면 그 값을 담아 던진다', () => {
      expect(() => factoryWith({ CALL_ANALYSIS_STT_PROVIDER: 'clova' }).stt())
        .toThrow(/clova/);
    });
  });

  describe('llm()', () => {
    it('fake 프로바이더를 만든다', () => {
      const provider = factoryWith({ CALL_ANALYSIS_LLM_PROVIDER: 'fake' }).llm();

      expect(provider.name).toBe('fake');
      expect(typeof provider.complete).toBe('function');
    });

    it('같은 인스턴스를 재사용한다', () => {
      const factory = factoryWith({ CALL_ANALYSIS_LLM_PROVIDER: 'fake' });

      expect(factory.llm()).toBe(factory.llm());
    });

    it('설정이 비어 있으면 어떤 env 를 채워야 하는지 알려준다', () => {
      expect(() => factoryWith({}).llm()).toThrow(/CALL_ANALYSIS_LLM_PROVIDER/);
    });

    it('모르는 값이면 그 값을 담아 던진다', () => {
      expect(() => factoryWith({ CALL_ANALYSIS_LLM_PROVIDER: 'bedrock' }).llm())
        .toThrow(/bedrock/);
    });
  });

  it('부팅 시점이 아니라 호출 시점에 검증한다', () => {
    expect(() => factoryWith({})).not.toThrow();
  });
});

describe('CallAnalysisProviderFactory — 실 프로바이더', () => {
  describe('STT', () => {
    it('local 은 endpoint 와 model 을 둘 다 요구한다', () => {
      expect(() => factoryWith({ CALL_ANALYSIS_STT_PROVIDER: 'local' }).stt())
        .toThrow(/CALL_ANALYSIS_STT_ENDPOINT/);
      expect(() => factoryWith({
        CALL_ANALYSIS_STT_PROVIDER: 'local',
        CALL_ANALYSIS_STT_ENDPOINT: 'http://stt:8000',
      }).stt()).toThrow(/CALL_ANALYSIS_STT_MODEL/);
    });

    it('local 은 키 없이도 만들어진다 — 사이드카는 보통 인증이 없다', () => {
      const provider = factoryWith({
        CALL_ANALYSIS_STT_PROVIDER: 'local',
        CALL_ANALYSIS_STT_ENDPOINT: 'http://stt:8000',
        CALL_ANALYSIS_STT_MODEL: 'large-v3',
      }).stt();

      expect(provider.name).toBe('local');
      expect((provider as any).endpoint).toBe('http://stt:8000/v1/audio/transcriptions');
    });

    it('openai 는 endpoint 기본값을 쓰고 키를 요구한다', () => {
      expect(() => factoryWith({
        CALL_ANALYSIS_STT_PROVIDER: 'openai',
        CALL_ANALYSIS_STT_MODEL: 'whisper-1',
      }).stt()).toThrow(/CALL_ANALYSIS_STT_API_KEY/);

      const provider = factoryWith({
        CALL_ANALYSIS_STT_PROVIDER: 'openai',
        CALL_ANALYSIS_STT_MODEL: 'whisper-1',
        CALL_ANALYSIS_STT_API_KEY: 'sk-test',
      }).stt();

      expect(provider.name).toBe('openai');
      expect((provider as any).endpoint).toBe('https://api.openai.com/v1/audio/transcriptions');
    });
  });

  describe('LLM', () => {
    it('local 은 endpoint 와 model 을 요구하고 키는 선택이다', () => {
      expect(() => factoryWith({ CALL_ANALYSIS_LLM_PROVIDER: 'local' }).llm())
        .toThrow(/CALL_ANALYSIS_LLM_ENDPOINT/);

      const provider = factoryWith({
        CALL_ANALYSIS_LLM_PROVIDER: 'local',
        CALL_ANALYSIS_LLM_ENDPOINT: 'http://vllm:8000',
        CALL_ANALYSIS_LLM_MODEL: 'qwen2.5-7b-instruct',
      }).llm();

      expect(provider.name).toBe('local');
      expect((provider as any).endpoint).toBe('http://vllm:8000/v1/chat/completions');
    });

    it('openai 는 기본 주소를 쓴다', () => {
      const provider = factoryWith({
        CALL_ANALYSIS_LLM_PROVIDER: 'openai',
        CALL_ANALYSIS_LLM_MODEL: 'gpt-4o-mini',
        CALL_ANALYSIS_LLM_API_KEY: 'sk-test',
      }).llm();

      expect(provider.name).toBe('openai');
      expect((provider as any).endpoint).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('anthropic 은 키를 요구하고 기본 주소를 쓴다', () => {
      expect(() => factoryWith({
        CALL_ANALYSIS_LLM_PROVIDER: 'anthropic',
        CALL_ANALYSIS_LLM_MODEL: 'claude-sonnet-5',
      }).llm()).toThrow(/CALL_ANALYSIS_LLM_API_KEY/);

      const provider = factoryWith({
        CALL_ANALYSIS_LLM_PROVIDER: 'anthropic',
        CALL_ANALYSIS_LLM_MODEL: 'claude-sonnet-5',
        CALL_ANALYSIS_LLM_API_KEY: 'sk-ant-test',
      }).llm();

      expect(provider.name).toBe('anthropic');
      expect((provider as any).endpoint).toBe('https://api.anthropic.com/v1/messages');
    });
  });

  it('타임아웃은 env 로 조정한다', () => {
    const provider = factoryWith({
      CALL_ANALYSIS_STT_PROVIDER: 'local',
      CALL_ANALYSIS_STT_ENDPOINT: 'http://stt:8000',
      CALL_ANALYSIS_STT_MODEL: 'large-v3',
      CALL_ANALYSIS_STT_TIMEOUT_MS: '90000',
    }).stt();

    expect((provider as any).timeoutMs).toBe(90_000);
  });
});
