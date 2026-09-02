import { requestJson, resolveApiUrl } from '../http/provider-http';
import { SttProvider, SttSegment, SttTranscribeInput, SttTranscribeResult } from '../stt.provider';

const API_PATH = 'audio/transcriptions';

export interface OpenAiCompatibleSttOptions {
  name: string;
  endpoint: string;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
}

interface VerboseJsonResponse {
  text?: string;
  segments?: Array<{ start?: number; end?: number; text?: string; avg_logprob?: number }>;
}

/**
 * OpenAI 호환 음성인식(`/v1/audio/transcriptions`).
 *
 * 온프레(faster-whisper-server, speaches, whisper.cpp server)와 OpenAI 가 **같은 와이어 포맷**이라
 * 어댑터를 하나만 둔다. 계획서 1.5 는 파일 두 개로 적었지만, LLM 쪽 D5 와 같은 이유로 합쳤다 —
 * 다른 것은 주소·모델명·키뿐이고, 둘로 나누면 응답 파싱을 두 곳에서 고치게 된다.
 */
export class OpenAiCompatibleSttProvider implements SttProvider {
  readonly name: string;
  readonly endpoint: string;
  readonly timeoutMs: number;

  private readonly model: string;
  private readonly apiKey: string | null;

  constructor(options: OpenAiCompatibleSttOptions) {
    this.name = options.name;
    this.endpoint = resolveApiUrl(options.endpoint, API_PATH);
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  async transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const form = new FormData();
    // 이미 모노 WAV 로 만들어져서 들어온다 (TranscriptionService 가 채널을 나눈다).
    // Buffer 를 그대로 Blob 에 넣으면 타입이 안 맞는다. 뷰로 감싸 복사 없이 넘긴다 —
    // 긴 통화의 PCM 을 한 번 더 복사하면 그만큼 최대 메모리가 는다.
    const view = new Uint8Array(input.audio.buffer as ArrayBuffer, input.audio.byteOffset, input.audio.byteLength);
    form.append('file', new Blob([view], { type: 'audio/wav' }), 'call.wav');
    form.append('model', this.model);
    form.append('language', input.language);
    form.append('response_format', 'verbose_json');

    const payload = await requestJson<VerboseJsonResponse>({
      url: this.endpoint,
      label: `${this.name} STT`,
      body: form,
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      timeoutMs: this.timeoutMs,
    });

    const text = (payload.text ?? '').trim();
    if (!text) {
      return { text: '', segments: [], modelName: this.model };
    }

    const segments = this.toSegments(payload, input, text);
    const confidences = segments
      .map((segment) => segment.confidence)
      .filter((value): value is number => typeof value === 'number');

    return {
      text,
      segments,
      confidence: confidences.length
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : undefined,
      modelName: this.model,
    };
  }

  private toSegments(payload: VerboseJsonResponse, input: SttTranscribeInput, text: string): SttSegment[] {
    const raw = Array.isArray(payload.segments) ? payload.segments : [];

    if (!raw.length) {
      // 세그먼트를 안 주는 서버도 있다. 재생 위치 점프는 못 하지만 전문은 살린다.
      return [{ speaker: input.speaker, startMs: 0, endMs: durationMs(input), text }];
    }

    return raw
      .map((segment) => ({
        speaker: input.speaker,
        startMs: Math.round((segment.start ?? 0) * 1000),
        endMs: Math.round((segment.end ?? 0) * 1000),
        text: (segment.text ?? '').trim(),
        ...(typeof segment.avg_logprob === 'number'
          // avg_logprob 는 로그확률(음수)이다. exp 로 0~1 로 되돌린다.
          ? { confidence: Math.max(0, Math.min(1, Math.exp(segment.avg_logprob))) }
          : {}),
      }))
      .filter((segment) => segment.text.length > 0);
  }
}

function durationMs(input: SttTranscribeInput): number {
  const bytesPerSecond = input.sampleRate * (input.bitsPerSample / 8);
  if (bytesPerSecond <= 0) return 0;
  return Math.round((input.audio.length / bytesPerSecond) * 1000);
}
