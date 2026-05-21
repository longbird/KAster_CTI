export type TimeSyncStatus = 'OK' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type TimeSyncSource = 'database' | 'pbx';

export interface TimeSyncStatusResult {
  status: TimeSyncStatus;
  driftSeconds: number;
  appTime: string;
  dbTime?: string;
  pbxTime?: string | null;
  source: TimeSyncSource;
  error?: string;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
}

const WARNING_THRESHOLD_SECONDS = 5;
const CRITICAL_THRESHOLD_SECONDS = 60;

export function classifyTimeSyncStatus(driftSeconds: number): TimeSyncStatus {
  const absoluteDrift = Math.abs(driftSeconds);
  if (absoluteDrift >= CRITICAL_THRESHOLD_SECONDS) return 'CRITICAL';
  if (absoluteDrift >= WARNING_THRESHOLD_SECONDS) return 'WARNING';
  return 'OK';
}

export function computeTimeSyncStatus(input: {
  appNow: Date;
  referenceNow: Date;
  source: TimeSyncSource;
  dbNow?: Date;
}): TimeSyncStatusResult {
  const driftSeconds = Math.round((input.referenceNow.getTime() - input.appNow.getTime()) / 1000);
  return {
    status: classifyTimeSyncStatus(driftSeconds),
    driftSeconds,
    appTime: input.appNow.toISOString(),
    ...(input.dbNow ? { dbTime: input.dbNow.toISOString() } : {}),
    ...(input.source === 'pbx' ? { pbxTime: input.referenceNow.toISOString() } : {}),
    source: input.source,
    warningThresholdSeconds: WARNING_THRESHOLD_SECONDS,
    criticalThresholdSeconds: CRITICAL_THRESHOLD_SECONDS,
  };
}

export function unknownTimeSyncStatus(input: {
  appNow: Date;
  source: TimeSyncSource;
  dbNow?: Date;
  error?: string;
}): TimeSyncStatusResult {
  return {
    status: 'UNKNOWN',
    driftSeconds: 0,
    appTime: input.appNow.toISOString(),
    ...(input.dbNow ? { dbTime: input.dbNow.toISOString() } : {}),
    ...(input.source === 'pbx' ? { pbxTime: null } : {}),
    source: input.source,
    ...(input.error ? { error: input.error } : {}),
    warningThresholdSeconds: WARNING_THRESHOLD_SECONDS,
    criticalThresholdSeconds: CRITICAL_THRESHOLD_SECONDS,
  };
}

export function extractPbxTimeFromAmiFrames(frames: Array<Record<string, string | undefined>>): Date | null {
  const text = frames
    .flatMap((frame) => Object.values(frame).filter(Boolean))
    .join('\n');

  const match = text.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/);
  if (!match) return null;

  const normalized = match[0]
    .replace(' ', 'T')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
