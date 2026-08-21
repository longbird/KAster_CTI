import { buildDefaultMohWav } from './default-moh';

const FULL_SCALE = 32767;

function readPeak(wav: Buffer): number {
  let peak = 0;
  for (let offset = 44; offset + 1 < wav.length; offset += 2) {
    peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
  }
  return peak / FULL_SCALE;
}

describe('buildDefaultMohWav', () => {
  it('renders 8kHz mono 16-bit PCM that Asterisk can play', () => {
    const wav = buildDefaultMohWav();

    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1);   // PCM
    expect(wav.readUInt16LE(22)).toBe(1);   // mono
    expect(wav.readUInt32LE(24)).toBe(8000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
  });

  /**
   * 대기음이 너무 작으면 발신자에게는 무음이다. 통화가 끊어진 줄 알고 먼저 끊는데,
   * 로그에는 그냥 "발신자가 포기함" 으로만 남아 원인을 알 수 없다.
   * 예전 값 0.045(-27 dBFS)가 실제로 그랬다.
   */
  it('is loud enough to hear over a phone line', () => {
    const peak = readPeak(buildDefaultMohWav());

    expect(peak).toBeGreaterThan(0.15);  // -16 dBFS 보다 커야 들린다
    expect(peak).toBeLessThan(0.5);      // 사인파라 이 위로는 귀에 거슬린다
  });

  it('leaves a gap between notes so it does not read as a stuck tone', () => {
    const wav = buildDefaultMohWav();
    // 각 1초 구간의 끝부분(0.65초 이후)은 무음이어야 한다.
    const silentSampleOffset = 44 + Math.floor(8000 * 0.9) * 2;

    expect(wav.readInt16LE(silentSampleOffset)).toBe(0);
  });
});
