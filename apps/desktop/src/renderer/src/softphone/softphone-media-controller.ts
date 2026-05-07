interface AudioElementLike {
  src?: string;
  loop?: boolean;
  autoplay?: boolean;
  volume?: number;
  currentTime: number;
  srcObject?: MediaStream | null;
  play(): Promise<void>;
  pause(): void;
  setSinkId?(sinkId: string): Promise<void>;
}

interface SoftphoneMediaControllerOptions {
  createAudioElement: () => AudioElementLike;
}

const RING_TONE_DATA_URI = (() => {
  const sampleRate = 8000;
  const durationMs = 3000;
  const toneDurationMs = 900;
  const frequencies = [440, 480];
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const toneSampleCount = Math.floor((sampleRate * toneDurationMs) / 1000);
  const pcm = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    if (index >= toneSampleCount) {
      pcm[index] = 0;
      continue;
    }
    const time = index / sampleRate;
    const sample = frequencies
      .map((frequency) => Math.sin(2 * Math.PI * frequency * time))
      .reduce((sum, value) => sum + value, 0) / frequencies.length;
    pcm[index] = Math.round(sample * 32767 * 0.08);
  }

  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcm.byteLength, true);

  let offset = 44;
  for (const sample of pcm) {
    view.setInt16(offset, sample, true);
    offset += 2;
  }

  let binary = '';
  wav.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return `data:audio/wav;base64,${btoa(binary)}`;
})();

export class SoftphoneMediaController {
  private readonly remoteAudio: AudioElementLike;
  private readonly ringAudio: AudioElementLike;
  private remoteStream: MediaStream | null = null;
  private remotePlayRequest = 0;

  constructor(options: SoftphoneMediaControllerOptions) {
    this.remoteAudio = options.createAudioElement();
    this.remoteAudio.autoplay = true;

    this.ringAudio = options.createAudioElement();
    this.ringAudio.src = RING_TONE_DATA_URI;
    this.ringAudio.loop = true;
    this.ringAudio.volume = 0.35;
  }

  async applyOutputDevice(deviceId: string | null | undefined) {
    if (!deviceId || !this.remoteAudio.setSinkId) {
      return;
    }

    await this.remoteAudio.setSinkId(deviceId);
  }

  async applyRingDevice(deviceId: string | null | undefined) {
    if (!deviceId || !this.ringAudio.setSinkId) {
      return;
    }

    await this.ringAudio.setSinkId(deviceId);
  }

  async attachRemoteStream(stream: MediaStream) {
    const requestId = this.remotePlayRequest + 1;
    this.remotePlayRequest = requestId;

    if (this.remoteStream !== stream || this.remoteAudio.srcObject !== stream) {
      this.remoteStream = stream;
      this.remoteAudio.srcObject = stream;
      this.remoteAudio.currentTime = 0;
    }

    try {
      await this.remoteAudio.play();
    } catch (error) {
      if (requestId !== this.remotePlayRequest || isInterruptedPlayRequest(error)) {
        return;
      }
      throw error;
    }
  }

  detachRemoteStream() {
    this.remotePlayRequest += 1;
    this.remoteStream = null;
    this.remoteAudio.pause();
    this.remoteAudio.srcObject = null;
  }

  async startRingtone() {
    this.ringAudio.currentTime = 0;
    await this.ringAudio.play();
  }

  stopRingtone() {
    this.ringAudio.pause();
    this.ringAudio.currentTime = 0;
  }
}

function isInterruptedPlayRequest(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === 'AbortError' || /interrupted by a new load request/i.test(error.message);
}
