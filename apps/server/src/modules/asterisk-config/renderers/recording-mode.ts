export const RECORDING_CHANNEL_MODES = ['MONO', 'STEREO_RAW'] as const;

export type RecordingChannelMode = typeof RECORDING_CHANNEL_MODES[number];

export function normalizeRecordingChannelMode(value: unknown): RecordingChannelMode {
  return value === 'STEREO_RAW' ? 'STEREO_RAW' : 'MONO';
}

export function getRecordingFileExtension(mode: RecordingChannelMode): 'wav' | 'raw' {
  return mode === 'STEREO_RAW' ? 'raw' : 'wav';
}

export function getMixMonitorOptions(mode: RecordingChannelMode): 'b' | 'bD' {
  return mode === 'STEREO_RAW' ? 'bD' : 'b';
}
