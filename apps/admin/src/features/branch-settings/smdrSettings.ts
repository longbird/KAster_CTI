export type CidProgramKey = 'LOGI' | 'CALLMANOR' | 'ICON';

export interface CidProgramOption {
  key: CidProgramKey;
  label: string;
  defaultPort: number;
}

export interface CidProgramSetting {
  programKey: CidProgramKey;
  enabled?: boolean | null;
  inboundEnabled?: boolean | null;
  outboundEnabled?: boolean | null;
  includeOriginalCallerId?: boolean | null;
}

export interface SmdrProfile {
  enabled?: boolean;
  programs?: CidProgramSetting[] | null;
}

export interface SmdrFormFields {
  smdrEnabled?: boolean;
  smdrPrograms?: CidProgramSetting[];
}

export const CID_PROGRAM_OPTIONS: CidProgramOption[] = [
  { key: 'LOGI', label: '로지', defaultPort: 28002 },
  { key: 'CALLMANOR', label: '콜마너', defaultPort: 28004 },
  { key: 'ICON', label: '아이콘', defaultPort: 28003 },
];

const CID_PROGRAM_KEYS = new Set<CidProgramKey>(CID_PROGRAM_OPTIONS.map((program) => program.key));

function isCidProgramKey(value: unknown): value is CidProgramKey {
  return typeof value === 'string' && CID_PROGRAM_KEYS.has(value as CidProgramKey);
}

function normalizeProgram(row: Partial<CidProgramSetting>, fallback: CidProgramOption): CidProgramSetting {
  return {
    programKey: isCidProgramKey(row.programKey) ? row.programKey : fallback.key,
    enabled: row.enabled ?? false,
    inboundEnabled: row.inboundEnabled ?? true,
    outboundEnabled: row.outboundEnabled ?? true,
    includeOriginalCallerId: row.includeOriginalCallerId ?? true,
  };
}

function normalizePrograms(value?: CidProgramSetting[] | null): CidProgramSetting[] {
  const byKey = new Map<CidProgramKey, CidProgramSetting>();
  for (const row of value ?? []) {
    if (!isCidProgramKey(row.programKey)) continue;
    byKey.set(row.programKey, normalizeProgram(row, CID_PROGRAM_OPTIONS.find((item) => item.key === row.programKey)!));
  }

  return CID_PROGRAM_OPTIONS.map((program) => normalizeProgram(byKey.get(program.key) ?? {}, program));
}

export function hydrateSmdrFormFields(profile?: SmdrProfile | null): Required<SmdrFormFields> {
  return {
    smdrEnabled: profile?.enabled ?? false,
    smdrPrograms: normalizePrograms(profile?.programs),
  };
}

export function buildSmdrPayload(values: SmdrFormFields): SmdrProfile {
  return {
    enabled: values.smdrEnabled ?? false,
    programs: normalizePrograms(values.smdrPrograms),
  };
}
