export interface LlmCompleteInput {
  system: string;
  user: string;
  maxTokens: number;
  /** 'json' 이면 프로바이더가 JSON 만 내도록 강제한다. 결과는 호출 측에서 다시 검증한다. */
  responseFormat?: 'json';
}

export interface LlmCompleteResult {
  text: string;
  modelName?: string;
}

export interface LlmProvider {
  readonly name: string;
  complete(input: LlmCompleteInput): Promise<LlmCompleteResult>;
}
