/**
 * 실 녹취 한 건을 설정된 STT 프로바이더에 넣어보고 결과를 그대로 찍는다.
 *
 * 왜 필요한가 — 한국어 8kHz 전화 대역 인식률은 계획서 1.12 의 1순위 리스크인데,
 * 통화를 새로 걸고 job sweep 을 기다려서는 프로바이더/모델을 비교할 수 없다.
 * 이 스크립트는 DB 만 빼고 운영과 같은 경로를 탄다 — 채널 분리 → STT → PII 마스킹.
 *
 *   npx ts-node scripts/stt-probe.ts <녹취.wav>
 *
 * 프로바이더는 .env 의 CALL_ANALYSIS_STT_* 를 그대로 쓴다. 모델을 바꿔가며 비교하려면
 * 앞에 붙여 덮어쓴다:
 *
 *   CALL_ANALYSIS_STT_MODEL=large-v3 npx ts-node scripts/stt-probe.ts call.wav
 */
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import {
  buildMonoWav,
  deinterleaveStereoPcm,
  parseWavHeader,
} from '../src/modules/call-analysis/audio/wav-channels.util';
import { maskPii } from '../src/modules/call-analysis/pii-mask.util';
import { CallAnalysisProviderFactory } from '../src/modules/call-analysis/providers/provider.factory';
import { SpeakerLabel } from '../src/modules/call-analysis/providers/stt.provider';

dotenv.config();

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error('사용법: npx ts-node scripts/stt-probe.ts <녹취.wav>');
  }

  const audio = readFileSync(filePath);
  const header = parseWavHeader(audio);
  const pcm = audio.subarray(header.dataOffset, header.dataOffset + header.dataSize);

  const config = {
    get: (key: string, fallback?: string) => process.env[key] ?? fallback,
  } as unknown as ConfigService;
  const provider = new CallAnalysisProviderFactory(config).stt();
  const language = process.env.CALL_ANALYSIS_LANGUAGE ?? 'ko';

  console.log(`파일      : ${filePath}`);
  console.log(`형식      : ${header.sampleRate}Hz ${header.bitsPerSample}bit ${header.channels}ch`);
  console.log(`프로바이더: ${provider.name} (${(provider as any).endpoint ?? '로컬'})`);
  console.log('');

  for (const track of splitTracks(pcm, header)) {
    const wav = buildMonoWav(track.pcm, {
      sampleRate: header.sampleRate,
      bitsPerSample: header.bitsPerSample,
    });

    const startedAt = Date.now();
    const result = await provider.transcribe({
      audio: wav,
      sampleRate: header.sampleRate,
      bitsPerSample: header.bitsPerSample,
      language,
      speaker: track.speaker,
    });
    const elapsedMs = Date.now() - startedAt;

    console.log(`── ${track.speaker} ─────────────────────────────`);
    console.log(`모델      : ${result.modelName ?? '(미보고)'}`);
    console.log(`소요      : ${(elapsedMs / 1000).toFixed(1)}초`);
    console.log(`신뢰도    : ${result.confidence?.toFixed(3) ?? '(미보고)'}`);
    console.log(`세그먼트  : ${result.segments.length}개`);
    for (const segment of result.segments) {
      console.log(`  [${formatMs(segment.startMs)}-${formatMs(segment.endMs)}] ${maskPii(segment.text)}`);
    }
    console.log('');
    // 저장되는 것과 같은 형태로 한 번 더 — 마스킹이 멀쩡한 숫자를 지우고 있지 않은지 눈으로 본다.
    console.log(`저장될 전문: ${maskPii(result.text)}`);
    console.log('');
  }
}

/** 운영과 같은 규칙으로 채널을 나눈다 (`TranscriptionService.splitTracks`). */
function splitTracks(pcm: Buffer, header: { channels: number; bitsPerSample: number }) {
  if (header.channels !== 2) {
    return [{ speaker: 'UNKNOWN' as SpeakerLabel, pcm }];
  }

  const { left, right } = deinterleaveStereoPcm(pcm, header.bitsPerSample);
  const customerOnRight =
    (process.env.CALL_ANALYSIS_CUSTOMER_CHANNEL ?? 'left').trim().toLowerCase() === 'right';
  return [
    { speaker: 'CUSTOMER' as SpeakerLabel, pcm: customerOnRight ? right : left },
    { speaker: 'AGENT' as SpeakerLabel, pcm: customerOnRight ? left : right },
  ];
}

function formatMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
