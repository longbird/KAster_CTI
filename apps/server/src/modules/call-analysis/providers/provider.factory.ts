import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeLlmProvider } from './fake/fake-llm.provider';
import { FakeSttProvider } from './fake/fake-stt.provider';
import { AnthropicLlmProvider } from './llm/anthropic-llm.provider';
import { OpenAiCompatibleLlmProvider } from './llm/openai-compatible-llm.provider';
import { LlmProvider } from './llm.provider';
import { OpenAiCompatibleSttProvider } from './stt/openai-compatible-stt.provider';
import { SttProvider } from './stt.provider';

const OPENAI_STT_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_LLM_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_LLM_ENDPOINT = 'https://api.anthropic.com/v1/messages';

// STT 는 통화 길이만큼 걸린다 — CPU whisper 로 5분 통화가 수 분이다. LLM 은 훨씬 짧다.
const DEFAULT_STT_TIMEOUT_MS = 300_000;
const DEFAULT_LLM_TIMEOUT_MS = 120_000;

/**
 * env 로 STT/LLM 구현을 고른다.
 * 부팅 시점이 아니라 **첫 호출 시점**에 검증한다 — 분석 기능을 끈 사이트가 키 없이도 떠야 한다.
 */
@Injectable()
export class CallAnalysisProviderFactory {
  private sttProvider?: SttProvider;
  private llmProvider?: LlmProvider;

  constructor(private readonly config: ConfigService) {}

  stt(): SttProvider {
    if (!this.sttProvider) {
      this.sttProvider = this.createStt();
    }
    return this.sttProvider;
  }

  llm(): LlmProvider {
    if (!this.llmProvider) {
      this.llmProvider = this.createLlm();
    }
    return this.llmProvider;
  }

  private createStt(): SttProvider {
    const kind = this.resolveKind('CALL_ANALYSIS_STT_PROVIDER');
    const timeoutMs = this.timeoutFromEnv('CALL_ANALYSIS_STT_TIMEOUT_MS', DEFAULT_STT_TIMEOUT_MS);

    switch (kind) {
      case 'fake':
        return new FakeSttProvider();
      case 'local':
        return new OpenAiCompatibleSttProvider({
          name: 'local',
          endpoint: this.required('CALL_ANALYSIS_STT_ENDPOINT'),
          model: this.required('CALL_ANALYSIS_STT_MODEL'),
          // 사이드카는 보통 인증이 없다.
          apiKey: this.optional('CALL_ANALYSIS_STT_API_KEY'),
          timeoutMs,
        });
      case 'openai':
        return new OpenAiCompatibleSttProvider({
          name: 'openai',
          endpoint: this.optional('CALL_ANALYSIS_STT_ENDPOINT') ?? OPENAI_STT_ENDPOINT,
          model: this.required('CALL_ANALYSIS_STT_MODEL'),
          apiKey: this.required('CALL_ANALYSIS_STT_API_KEY'),
          timeoutMs,
        });
      default:
        throw new Error(`unsupported CALL_ANALYSIS_STT_PROVIDER: ${kind}`);
    }
  }

  private createLlm(): LlmProvider {
    const kind = this.resolveKind('CALL_ANALYSIS_LLM_PROVIDER');
    const timeoutMs = this.timeoutFromEnv('CALL_ANALYSIS_LLM_TIMEOUT_MS', DEFAULT_LLM_TIMEOUT_MS);

    switch (kind) {
      case 'fake':
        return new FakeLlmProvider();
      case 'local':
        return new OpenAiCompatibleLlmProvider({
          name: 'local',
          endpoint: this.required('CALL_ANALYSIS_LLM_ENDPOINT'),
          model: this.required('CALL_ANALYSIS_LLM_MODEL'),
          apiKey: this.optional('CALL_ANALYSIS_LLM_API_KEY'),
          timeoutMs,
        });
      case 'openai':
        return new OpenAiCompatibleLlmProvider({
          name: 'openai',
          endpoint: this.optional('CALL_ANALYSIS_LLM_ENDPOINT') ?? OPENAI_LLM_ENDPOINT,
          model: this.required('CALL_ANALYSIS_LLM_MODEL'),
          apiKey: this.required('CALL_ANALYSIS_LLM_API_KEY'),
          timeoutMs,
        });
      case 'anthropic':
        return new AnthropicLlmProvider({
          endpoint: this.optional('CALL_ANALYSIS_LLM_ENDPOINT') ?? ANTHROPIC_LLM_ENDPOINT,
          model: this.required('CALL_ANALYSIS_LLM_MODEL'),
          apiKey: this.required('CALL_ANALYSIS_LLM_API_KEY'),
          timeoutMs,
        });
      default:
        throw new Error(`unsupported CALL_ANALYSIS_LLM_PROVIDER: ${kind}`);
    }
  }

  private resolveKind(envKey: string): string {
    const raw = (this.config.get<string>(envKey, '') ?? '').trim().toLowerCase();
    if (!raw) {
      throw new Error(`${envKey} is not configured`);
    }
    return raw;
  }

  /** 없으면 **어떤 env 를 채워야 하는지**를 담아 던진다. 값은 절대 로그에 남기지 않는다. */
  private required(envKey: string): string {
    const value = this.optional(envKey);
    if (!value) {
      throw new Error(`${envKey} is required for the selected call analysis provider`);
    }
    return value;
  }

  private optional(envKey: string): string | null {
    const raw = (this.config.get<string>(envKey, '') ?? '').trim();
    return raw || null;
  }

  private timeoutFromEnv(envKey: string, fallback: number): number {
    const parsed = Number.parseInt(this.optional(envKey) ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
