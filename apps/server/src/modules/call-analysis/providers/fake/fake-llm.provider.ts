import { LlmCompleteInput, LlmCompleteResult, LlmProvider } from '../llm.provider';

const SUMMARY_ECHO_CHARS = 80;

/**
 * 개발·테스트용 LLM. 외부 호출 없이 분석 서비스가 기대하는 JSON 스키마를 그대로 만든다.
 * 같은 입력에는 같은 출력을 준다 — 테스트가 흔들리지 않게 하려는 것이다.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';

  async complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
    const echo = input.user.slice(0, SUMMARY_ECHO_CHARS).replace(/\s+/g, ' ').trim();

    return {
      text: JSON.stringify({
        summary: `모의 요약: ${echo}`,
        sentiment: 'NEUTRAL',
        sentimentScore: 0,
        categoryCode: null,
        keywords: ['모의', '분석'],
        riskFlags: [],
      }),
      modelName: 'fake-llm',
    };
  }
}
