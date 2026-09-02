import { requestJson, resolveApiUrl } from '../http/provider-http';
import { LlmCompleteInput, LlmCompleteResult, LlmProvider } from '../llm.provider';

const API_PATH = 'chat/completions';

export interface OpenAiCompatibleLlmOptions {
  name: string;
  endpoint: string;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * OpenAI 호환 chat completions.
 *
 * 계획서 D5 — vLLM·Ollama·LM Studio 가 전부 이 API 를 내므로 온프레와 클라우드를 한 어댑터로 덮는다.
 * 다른 것은 주소·모델명·키뿐이다.
 */
export class OpenAiCompatibleLlmProvider implements LlmProvider {
  readonly name: string;
  readonly endpoint: string;
  readonly timeoutMs: number;

  private readonly model: string;
  private readonly apiKey: string | null;

  constructor(options: OpenAiCompatibleLlmOptions) {
    this.name = options.name;
    this.endpoint = resolveApiUrl(options.endpoint, API_PATH);
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  async complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
    const payload = await requestJson<ChatCompletionResponse>({
      url: this.endpoint,
      label: `${this.name} LLM`,
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      timeoutMs: this.timeoutMs,
      body: {
        model: this.model,
        max_tokens: input.maxTokens,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        // 요구하지 않을 때는 넣지 않는다 — 이 필드를 모르는 로컬 서버가 400 을 낸다.
        ...(input.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      },
    });

    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error(`${this.name} LLM returned no completion`);
    }

    return { text, modelName: payload.model ?? this.model };
  }
}
