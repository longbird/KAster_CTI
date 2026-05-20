export type TimeSyncStatus = 'OK' | 'WARNING' | 'CRITICAL';

export interface TimeSyncStatusResult {
  status: TimeSyncStatus;
  driftSeconds: number;
  appTime: string;
  dbTime: string;
  source: 'database';
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
  dbNow: Date;
}): TimeSyncStatusResult {
  const driftSeconds = Math.round((input.dbNow.getTime() - input.appNow.getTime()) / 1000);
  return {
    status: classifyTimeSyncStatus(driftSeconds),
    driftSeconds,
    appTime: input.appNow.toISOString(),
    dbTime: input.dbNow.toISOString(),
    source: 'database',
    warningThresholdSeconds: WARNING_THRESHOLD_SECONDS,
    criticalThresholdSeconds: CRITICAL_THRESHOLD_SECONDS,
  };
}
