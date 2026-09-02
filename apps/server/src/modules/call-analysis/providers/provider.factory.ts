import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeLlmProvider } from './fake/fake-llm.provider';
import { FakeSttProvider } from './fake/fake-stt.provider';
import { LlmProvider } from './llm.provider';
import { SttProvider } from './stt.provider';

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
    switch (kind) {
      case 'fake':
        return new FakeSttProvider();
      default:
        throw new Error(`unsupported CALL_ANALYSIS_STT_PROVIDER: ${kind}`);
    }
  }

  private createLlm(): LlmProvider {
    const kind = this.resolveKind('CALL_ANALYSIS_LLM_PROVIDER');
    switch (kind) {
      case 'fake':
        return new FakeLlmProvider();
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
}
