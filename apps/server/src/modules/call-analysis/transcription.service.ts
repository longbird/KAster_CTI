import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { PrismaService } from '../../common/prisma.service';
import { RecordingEncryptionService } from '../recording-pipeline/recording-encryption.service';
import { buildMonoWav, deinterleaveStereoPcm, parseWavHeader } from './audio/wav-channels.util';
import { maskPii } from './pii-mask.util';
import { CallAnalysisProviderFactory } from './providers/provider.factory';
import { SpeakerLabel, SttSegment } from './providers/stt.provider';

const SPEAKER_TEXT_LABEL: Record<SpeakerLabel, string> = {
  CUSTOMER: '고객',
  AGENT: '상담원',
  UNKNOWN: '화자',
};

export interface TranscribeJobInput {
  tenantId: string;
  callId: string;
  recordingId: string;
}

export interface TranscribeJobResult {
  transcriptId: string;
  segmentCount: number;
}

/**
 * 확정된 녹취를 읽어 화자별 전문을 만든다.
 *
 * 녹취 확정(finalize) 단계는 암호화 직후 평문을 지우므로, 여기서는 암호문을 복호해서 읽는다.
 * 화자분리는 별도 모델 없이 MixMonitor 스테레오의 좌/우 채널을 나누는 것으로 처리한다.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: RecordingEncryptionService,
    private readonly providers: CallAnalysisProviderFactory,
  ) {}

  async transcribe(input: TranscribeJobInput): Promise<TranscribeJobResult> {
    const recording = await (this.prisma as any).callRecordings.findFirst({
      where: {
        tenantId: input.tenantId,
        callId: input.callId,
        recordingId: input.recordingId,
      },
    });

    if (!recording) {
      throw new Error(`recording not found: ${input.recordingId}`);
    }

    const audio = await this.loadAudio(recording);
    const header = parseWavHeader(audio);
    const pcm = audio.subarray(header.dataOffset, header.dataOffset + header.dataSize);
    const provider = this.providers.stt();
    const language = this.config.get<string>('CALL_ANALYSIS_LANGUAGE', 'ko');

    const segments: SttSegment[] = [];
    const modelNames = new Set<string>();
    const confidences: number[] = [];
    const isStereo = header.channels === 2;

    for (const track of this.splitTracks(pcm, header.channels, header.bitsPerSample)) {
      const result = await provider.transcribe({
        audio: buildMonoWav(track.pcm, {
          sampleRate: header.sampleRate,
          bitsPerSample: header.bitsPerSample,
        }),
        sampleRate: header.sampleRate,
        bitsPerSample: header.bitsPerSample,
        language,
        speaker: track.speaker,
      });

      if (result.modelName) modelNames.add(result.modelName);
      if (typeof result.confidence === 'number') confidences.push(result.confidence);
      segments.push(
        ...result.segments.map((segment) => ({
          ...segment,
          speaker: track.speaker,
          text: maskPii(segment.text),
        })),
      );
    }

    segments.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

    const fullText = segments
      .map((segment) => `${SPEAKER_TEXT_LABEL[segment.speaker]}: ${segment.text}`)
      .join('\n');
    const durationSeconds = this.computeDurationSeconds(header);
    const confidence = confidences.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null;

    const transcript = await this.saveTranscript({
      input,
      provider: provider.name,
      modelName: modelNames.size ? [...modelNames].join(',') : null,
      language,
      fullText,
      durationSeconds,
      confidence,
    });

    await this.replaceSegments(input.tenantId, transcript.transcriptId, segments);
    await (this.prisma as any).callRecordings.update({
      where: { recordingId: input.recordingId },
      data: { speakerSeparationStatus: isStereo ? 'SEPARATED' : 'NOT_APPLICABLE' },
    });

    this.logger.log(
      `transcribed call=${input.callId} recording=${input.recordingId} segments=${segments.length}`,
    );

    return { transcriptId: transcript.transcriptId, segmentCount: segments.length };
  }

  private splitTracks(
    pcm: Buffer,
    channels: number,
    bitsPerSample: number,
  ): Array<{ speaker: SpeakerLabel; pcm: Buffer }> {
    if (channels !== 2) {
      return [{ speaker: 'UNKNOWN', pcm }];
    }

    const { left, right } = deinterleaveStereoPcm(pcm, bitsPerSample);
    const customerOnRight =
      this.config.get<string>('CALL_ANALYSIS_CUSTOMER_CHANNEL', 'left').trim().toLowerCase() === 'right';

    return customerOnRight
      ? [
          { speaker: 'AGENT', pcm: left },
          { speaker: 'CUSTOMER', pcm: right },
        ]
      : [
          { speaker: 'CUSTOMER', pcm: left },
          { speaker: 'AGENT', pcm: right },
        ];
  }

  private async loadAudio(recording: Record<string, any>): Promise<Buffer> {
    if (recording.encryptionStatus === 'ENCRYPTED') {
      const encryptedPath = recording.encryptedPlaybackFilePath ?? recording.encryptedFilePath;
      if (!encryptedPath) {
        throw new Error(`recording has no encrypted file path: ${recording.recordingId}`);
      }
      return this.encryption.decryptFileToBuffer(encryptedPath);
    }

    const plainPath = recording.playbackFilePath ?? recording.filePath;
    if (!plainPath) {
      throw new Error(`recording has no readable file path: ${recording.recordingId}`);
    }
    return fs.readFile(plainPath);
  }

  private computeDurationSeconds(header: { dataSize: number; sampleRate: number; channels: number; bitsPerSample: number }) {
    const bytesPerSecond = header.sampleRate * header.channels * (header.bitsPerSample / 8);
    if (bytesPerSecond <= 0) return 0;
    return Math.round(header.dataSize / bytesPerSecond);
  }

  private async saveTranscript(params: {
    input: TranscribeJobInput;
    provider: string;
    modelName: string | null;
    language: string;
    fullText: string;
    durationSeconds: number;
    confidence: number | null;
  }) {
    const { input } = params;
    const payload = {
      provider: params.provider,
      modelName: params.modelName,
      language: params.language,
      fullText: params.fullText,
      durationSeconds: params.durationSeconds,
      confidence: params.confidence,
      status: 'READY',
      failureReason: null,
    };

    return (this.prisma as any).callTranscripts.upsert({
      where: {
        tenantId_callId_recordingId: {
          tenantId: input.tenantId,
          callId: input.callId,
          recordingId: input.recordingId,
        },
      },
      create: {
        tenantId: input.tenantId,
        callId: input.callId,
        recordingId: input.recordingId,
        ...payload,
      },
      update: payload,
    });
  }

  private async replaceSegments(tenantId: string, transcriptId: string, segments: SttSegment[]) {
    await (this.prisma as any).callTranscriptSegments.deleteMany({ where: { transcriptId } });
    if (!segments.length) return;

    await (this.prisma as any).callTranscriptSegments.createMany({
      data: segments.map((segment) => ({
        tenantId,
        transcriptId,
        speaker: segment.speaker,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        confidence: segment.confidence ?? null,
      })),
    });
  }
}
