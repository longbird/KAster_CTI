/**
 * 큐 대기음 기본 음원.
 *
 * 관리자가 대기음을 올리지 않은 현장에서도 발신자가 **뭔가 들리는** 상태여야 한다.
 * 아무 소리도 없으면 발신자는 통화가 끊어진 줄 알고 먼저 끊는다.
 */

const SAMPLE_RATE = 8000;
const SECONDS = 4;

// G4 - B4 - D5 - B4. 1초에 한 음씩, 0.65초 울리고 0.35초 쉰다.
const NOTES = [392, 494, 587, 494];
const NOTE_DUTY = 0.65;

/**
 * 최대 진폭. 풀스케일 대비 비율이다.
 *
 * 0.25 는 약 -12 dBFS 로, 통화 음성이 실리는 대역과 같은 수준이다.
 * 예전 값 0.045(-27 dBFS)는 전화선에서 사실상 들리지 않았다 — 실제로 큐에 들어가면
 * 무음으로 느껴졌다. 사인파는 음성보다 귀에 세게 들리므로 여기서 더 올리지 않는다.
 */
const PEAK_AMPLITUDE = 0.25;

const WAV_HEADER_BYTES = 44;
const PCM_16BIT = 1;
const MONO = 1;

export function buildDefaultMohWav(): Buffer {
  const sampleCount = SAMPLE_RATE * SECONDS;
  const pcm = Buffer.alloc(sampleCount * 2);

  for (let index = 0; index < sampleCount; index += 1) {
    const frequency = NOTES[Math.floor(index / SAMPLE_RATE) % NOTES.length];
    const time = index / SAMPLE_RATE;
    const sounding = (index % SAMPLE_RATE) < SAMPLE_RATE * NOTE_DUTY;
    const envelope = sounding ? PEAK_AMPLITUDE : 0;
    const sample = Math.round(Math.sin(2 * Math.PI * frequency * time) * 32767 * envelope);
    pcm.writeInt16LE(sample, index * 2);
  }

  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(PCM_16BIT, 20);
  header.writeUInt16LE(MONO, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
