import { requestJson, resolveApiUrl } from '../http/provider-http';
import { LlmCompleteInput, LlmCompleteResult, LlmProvider } from '../llm.provider';

const API_PATH = 'messages';
const API_VERSION = '2023-06-01';

export interface AnthropicLlmOptions {
  endpoint: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

interface MessagesResponse {
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
}

/**
 * Anthropic Messages API.
 *
 * OpenAI 호환이 아니라 별도 어댑터다 (계획서 D5). 차이는 셋이다 —
 * 키 헤더가 `x-api-key`, `system` 이 messages 밖에 있고, 응답이 블록 배열이다.
 *
 * JSON 강제 필드가 없어서 `response_format` 대응이 없다. 프롬프트가 JSON 을 요구하고
 * `parseAnalysisResponse` 가 코드펜스를 걷어내므로 그대로 통과한다.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly endpoint: string;
  readonly timeoutMs: number;

  private readonly model: string;
  private readonly apiKey: string;

  constructor(options: AnthropicLlmOptions) {
    this.endpoint = resolveApiUrl(options.endpoint, API_PATH);
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  async complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
    const payload = await requestJson<MessagesResponse>({
      url: this.endpoint,
      label: `${this.name} LLM`,
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      timeoutMs: this.timeoutMs,
      body: {
        model: this.model,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
      },
    });

    const text = (payload.content ?? [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');

    if (!text.trim()) {
      throw new Error(`${this.name} LLM returned no completion`);
    }

    return { text, modelName: payload.model ?? this.model };
  }
}
