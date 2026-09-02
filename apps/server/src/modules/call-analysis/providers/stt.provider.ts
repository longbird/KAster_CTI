export type SpeakerLabel = 'CUSTOMER' | 'AGENT' | 'UNKNOWN';

export interface SttSegment {
  speaker: SpeakerLabel;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}

export interface SttTranscribeInput {
  /**
   * 모노 WAV 버퍼. 스테레오 녹취는 채널을 나눈 뒤 화자별로 한 번씩 호출한다.
   * 스트림이 아니라 버퍼인 이유는 채널 분리 자체가 전체 PCM 을 필요로 하기 때문이다.
   */
  audio: Buffer;
  sampleRate: number;
  bitsPerSample: number;
  language: string;
  speaker: SpeakerLabel;
}

export interface SttTranscribeResult {
  text: string;
  segments: SttSegment[];
  confidence?: number;
  modelName?: string;
}

export interface SttProvider {
  readonly name: string;
  transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult>;
}
