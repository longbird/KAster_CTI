const WAV_HEADER_BYTES = 44;
const SUPPORTED_BITS_PER_SAMPLE = [8, 16];

export interface WavHeader {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
}

export interface MonoWavFormat {
  sampleRate: number;
  bitsPerSample: number;
}

/**
 * WAV 컨테이너의 fmt/data 청크를 읽는다.
 * MixMonitor 산출물은 44바이트 표준 헤더지만, 다른 도구를 거친 파일은 fmt 와 data 사이에
 * LIST 같은 청크가 끼기도 해서 청크를 순회한다.
 */
export function parseWavHeader(buffer: Buffer): WavHeader {
  if (buffer.length < WAV_HEADER_BYTES) {
    throw new Error('wav buffer is too short to contain a header');
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE buffer');
  }

  let format: Omit<WavHeader, 'dataOffset' | 'dataSize'> | null = null;
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (chunkId === 'fmt ') {
      format = {
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (chunkId === 'data') {
      if (!format) {
        throw new Error('wav data chunk appeared before fmt chunk');
      }
      return {
        ...format,
        dataOffset: body,
        dataSize: Math.min(chunkSize, buffer.length - body),
      };
    }

    // 청크는 짝수 바이트로 정렬된다.
    offset = body + chunkSize + (chunkSize % 2);
  }

  throw new Error('wav data chunk not found');
}

/**
 * 인터리브된 스테레오 PCM 을 좌/우 모노로 나눈다.
 * MixMonitor 스테레오 녹취는 한쪽이 고객, 다른 쪽이 상담원이라 이것만으로 화자가 갈린다.
 */
export function deinterleaveStereoPcm(
  pcm: Buffer,
  bitsPerSample: number,
): { left: Buffer; right: Buffer } {
  if (!SUPPORTED_BITS_PER_SAMPLE.includes(bitsPerSample)) {
    throw new Error(`unsupported bitsPerSample: ${bitsPerSample}`);
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameBytes = bytesPerSample * 2;
  const frames = Math.floor(pcm.length / frameBytes);
  const left = Buffer.alloc(frames * bytesPerSample);
  const right = Buffer.alloc(frames * bytesPerSample);

  for (let frame = 0; frame < frames; frame += 1) {
    const source = frame * frameBytes;
    const target = frame * bytesPerSample;
    pcm.copy(left, target, source, source + bytesPerSample);
    pcm.copy(right, target, source + bytesPerSample, source + frameBytes);
  }

  return { left, right };
}

/** 모노 PCM 에 44바이트 헤더를 붙여 STT 프로바이더가 받는 WAV 로 만든다. */
export function buildMonoWav(pcm: Buffer, format: MonoWavFormat): Buffer {
  const { sampleRate, bitsPerSample } = format;
  const channels = 1;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(WAV_HEADER_BYTES);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
