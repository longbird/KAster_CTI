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
