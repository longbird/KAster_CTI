import type { DesktopAudioPreferences, DesktopRingTonePresetId } from '../../../shared/ipc';

interface MediaStreamTrackLike {
  stop(): void;
}

interface MediaStreamLike {
  getTracks(): MediaStreamTrackLike[];
}

interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStreamLike>;
}

interface AudioElementLike {
  src: string;
  loop: boolean;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  setSinkId?(sinkId: string): Promise<void>;
}

interface AudioDeviceControllerOptions {
  mediaDevices: MediaDevicesLike;
  createAudioElement: () => AudioElementLike;
}

const OUTPUT_TONE_DATA_URI = buildToneDataUri(660, 220);

const RING_TONE_PRESET_PARAMS: Record<DesktopRingTonePresetId, { frequency: number; durationMs: number; gain: number }> = {
  classic: { frequency: 880, durationMs: 420, gain: 0.28 },
  soft: { frequency: 540, durationMs: 600, gain: 0.18 },
  urgent: { frequency: 1100, durationMs: 220, gain: 0.32 },
  silent: { frequency: 0, durationMs: 0, gain: 0 },
};

function getRingTonePresetUri(presetId: DesktopRingTonePresetId): string {
  const params = RING_TONE_PRESET_PARAMS[presetId] ?? RING_TONE_PRESET_PARAMS.classic;
  if (params.durationMs === 0) {
    return buildToneDataUri(0, 1, 0);
  }
  return buildToneDataUri(params.frequency, params.durationMs, params.gain);
}

function buildToneDataUri(frequency: number, durationMs: number, gain = 0.28) {
  const sampleRate = 8000;
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const pcm = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    pcm[index] = Math.round(Math.sin(2 * Math.PI * frequency * time) * 32767 * gain);
  }

  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
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
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export class AudioDeviceController {
  private readonly outputPreviewAudio: AudioElementLike;
  private readonly ringPreviewAudio: AudioElementLike;
  private activeInputStream: MediaStreamLike | null = null;
  private currentRingTonePresetId: DesktopRingTonePresetId = 'classic';

  constructor(private readonly options: AudioDeviceControllerOptions) {
    this.outputPreviewAudio = options.createAudioElement();
    this.outputPreviewAudio.src = OUTPUT_TONE_DATA_URI;
    this.outputPreviewAudio.loop = false;

    this.ringPreviewAudio = options.createAudioElement();
    this.ringPreviewAudio.src = getRingTonePresetUri('classic');
    this.ringPreviewAudio.loop = false;
  }

  applyRingTonePreset(presetId: DesktopRingTonePresetId) {
    if (this.currentRingTonePresetId === presetId) {
      return;
    }
    this.currentRingTonePresetId = presetId;
    this.ringPreviewAudio.src = getRingTonePresetUri(presetId);
  }

  getRingTonePresetId(): DesktopRingTonePresetId {
    return this.currentRingTonePresetId;
  }

  getCapabilities() {
    return {
      sinkSelectionSupported: typeof this.outputPreviewAudio.setSinkId === 'function',
    };
  }

  async applyPreferences(preferences: DesktopAudioPreferences) {
    if (preferences.outputDeviceId && this.outputPreviewAudio.setSinkId) {
      await this.outputPreviewAudio.setSinkId(preferences.outputDeviceId);
    }

    if (preferences.ringDeviceId && this.ringPreviewAudio.setSinkId) {
      await this.ringPreviewAudio.setSinkId(preferences.ringDeviceId);
    }
  }

  async requestInputAccess(preferences: DesktopAudioPreferences) {
    this.activeInputStream?.getTracks().forEach((track) => track.stop());
    this.activeInputStream = await this.options.mediaDevices.getUserMedia({
      audio: {
        deviceId: preferences.inputDeviceId ? { exact: preferences.inputDeviceId } : undefined,
        echoCancellation: preferences.echoCancellation,
        noiseSuppression: preferences.noiseSuppression,
      },
    });

    return this.activeInputStream;
  }

  async playOutputPreview() {
    this.outputPreviewAudio.currentTime = 0;
    await this.outputPreviewAudio.play();
  }

  async playRingPreview() {
    if (this.currentRingTonePresetId === 'silent') {
      return;
    }
    this.ringPreviewAudio.currentTime = 0;
    await this.ringPreviewAudio.play();
  }
}
