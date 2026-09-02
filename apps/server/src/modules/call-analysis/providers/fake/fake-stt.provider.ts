import { SttProvider, SttSegment, SttTranscribeInput, SttTranscribeResult } from '../stt.provider';

const SEGMENT_MS = 1000;

/**
 * 개발·테스트용 STT. 외부 호출 없이 오디오 길이에 비례한 모의 전문을 만든다.
 * 파이프라인(job 전이·저장·마스킹)을 실 프로바이더 없이 끝까지 검증하려고 둔다.
 */
export class FakeSttProvider implements SttProvider {
  readonly name = 'fake';

  async transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const durationMs = computeDurationMs(input);
    if (durationMs <= 0) {
      return { text: '', segments: [], confidence: 0, modelName: 'fake-stt' };
    }

    const segments: SttSegment[] = [];
    for (let startMs = 0; startMs < durationMs; startMs += SEGMENT_MS) {
      const endMs = Math.min(startMs + SEGMENT_MS, durationMs);
      segments.push({
        speaker: input.speaker,
        startMs,
        endMs,
        text: `[${input.speaker}] 구간 ${segments.length + 1} 모의 전문`,
        confidence: 0.9,
      });
    }

    return {
      text: segments.map((segment) => segment.text).join(' '),
      segments,
      confidence: 0.9,
      modelName: 'fake-stt',
    };
  }
}

function computeDurationMs(input: SttTranscribeInput): number {
  const bytesPerSecond = input.sampleRate * (input.bitsPerSample / 8);
  if (bytesPerSecond <= 0) return 0;
  return Math.round((input.audio.length / bytesPerSecond) * 1000);
}
