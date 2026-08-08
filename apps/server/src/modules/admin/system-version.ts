export interface SystemVersionInput {
  packageVersion?: string | null;
  commit?: string | null;
  buildTime?: string | null;
  nodeVersion?: string | null;
  nodeId?: string | null;
  startedAt: Date;
  now: Date;
}

export interface SystemVersionStatus {
  version: string;
  commit: string | null;
  buildTime: string | null;
  nodeVersion: string | null;
  nodeId: string | null;
  startedAt: string;
  uptimeSeconds: number;
}

function trimmedOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isoOrNull(value?: string | null): string | null {
  const trimmed = trimmedOrNull(value);
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function buildSystemVersion(input: SystemVersionInput): SystemVersionStatus {
  const elapsedMs = input.now.getTime() - input.startedAt.getTime();

  return {
    version: trimmedOrNull(input.packageVersion) ?? 'unknown',
    commit: trimmedOrNull(input.commit),
    buildTime: isoOrNull(input.buildTime),
    nodeVersion: trimmedOrNull(input.nodeVersion),
    nodeId: trimmedOrNull(input.nodeId),
    startedAt: input.startedAt.toISOString(),
    uptimeSeconds: Math.max(0, Math.floor(elapsedMs / 1000)),
  };
}
