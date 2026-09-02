import { buildMonoWav, deinterleaveStereoPcm, parseWavHeader } from './wav-channels.util';

function buildWav(options: {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  data: Buffer;
}): Buffer {
  const { channels, sampleRate, bitsPerSample, data } = options;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
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
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe('parseWavHeader', () => {
  it('44바이트 표준 헤더에서 포맷과 data 위치를 읽는다', () => {
    const data = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
    const wav = buildWav({ channels: 2, sampleRate: 8000, bitsPerSample: 16, data });

    expect(parseWavHeader(wav)).toEqual({
      channels: 2,
      sampleRate: 8000,
      bitsPerSample: 16,
      dataOffset: 44,
      dataSize: 8,
    });
  });

  it('fmt 와 data 사이에 다른 청크가 끼어 있어도 data 청크를 찾는다', () => {
    const data = Buffer.from([9, 0, 8, 0]);
    const base = buildWav({ channels: 1, sampleRate: 16000, bitsPerSample: 16, data });
    const listChunk = Buffer.alloc(8 + 4);
    listChunk.write('LIST', 0, 'ascii');
    listChunk.writeUInt32LE(4, 4);
    const wav = Buffer.concat([base.subarray(0, 36), listChunk, base.subarray(36)]);

    const parsed = parseWavHeader(wav);
    expect(parsed.channels).toBe(1);
    expect(parsed.dataOffset).toBe(44 + listChunk.length);
    expect(parsed.dataSize).toBe(4);
  });

  it('data 청크 크기가 실제 남은 바이트보다 크면 남은 바이트로 줄인다', () => {
    const data = Buffer.from([1, 0, 2, 0]);
    const wav = buildWav({ channels: 2, sampleRate: 8000, bitsPerSample: 16, data });
    wav.writeUInt32LE(9999, 40);

    expect(parseWavHeader(wav).dataSize).toBe(4);
  });

  it('RIFF/WAVE 가 아니면 던진다', () => {
    expect(() => parseWavHeader(Buffer.alloc(64))).toThrow(/not a RIFF\/WAVE/i);
  });

  it('헤더보다 짧은 버퍼는 던진다', () => {
    expect(() => parseWavHeader(Buffer.alloc(8))).toThrow(/too short/i);
  });
});

describe('deinterleaveStereoPcm', () => {
  it('16비트 스테레오를 좌/우 모노로 분리한다', () => {
    const pcm = Buffer.alloc(12);
    // frame0 L=100 R=-100, frame1 L=200 R=-200, frame2 L=300 R=-300
    pcm.writeInt16LE(100, 0);
    pcm.writeInt16LE(-100, 2);
    pcm.writeInt16LE(200, 4);
    pcm.writeInt16LE(-200, 6);
    pcm.writeInt16LE(300, 8);
    pcm.writeInt16LE(-300, 10);

    const { left, right } = deinterleaveStereoPcm(pcm, 16);

    expect(left.length).toBe(6);
    expect(right.length).toBe(6);
    expect([left.readInt16LE(0), left.readInt16LE(2), left.readInt16LE(4)]).toEqual([100, 200, 300]);
    expect([right.readInt16LE(0), right.readInt16LE(2), right.readInt16LE(4)]).toEqual([-100, -200, -300]);
  });

  it('8비트 스테레오도 분리한다', () => {
    const pcm = Buffer.from([10, 20, 30, 40]);

    const { left, right } = deinterleaveStereoPcm(pcm, 8);

    expect([...left]).toEqual([10, 30]);
    expect([...right]).toEqual([20, 40]);
  });

  it('프레임이 덜 찬 꼬리 바이트는 버린다', () => {
    const pcm = Buffer.alloc(6);
    pcm.writeInt16LE(1, 0);
    pcm.writeInt16LE(2, 2);
    // 마지막 2바이트는 우채널이 없는 불완전 프레임

    const { left, right } = deinterleaveStereoPcm(pcm, 16);

    expect(left.length).toBe(2);
    expect(right.length).toBe(2);
  });

  it('지원하지 않는 비트수는 던진다', () => {
    expect(() => deinterleaveStereoPcm(Buffer.alloc(8), 24)).toThrow(/bitsPerSample/i);
  });
});

describe('buildMonoWav', () => {
  it('모노 PCM 앞에 44바이트 헤더를 붙인다', () => {
    const pcm = Buffer.from([1, 0, 2, 0]);

    const wav = buildMonoWav(pcm, { sampleRate: 8000, bitsPerSample: 16 });

    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(8000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it('만든 모노 WAV 는 다시 파싱된다', () => {
    const pcm = Buffer.alloc(20);
    const wav = buildMonoWav(pcm, { sampleRate: 16000, bitsPerSample: 16 });

    expect(parseWavHeader(wav)).toEqual({
      channels: 1,
      sampleRate: 16000,
      bitsPerSample: 16,
      dataOffset: 44,
      dataSize: 20,
    });
  });
});
