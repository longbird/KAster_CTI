import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  DesktopGeneralPreferences,
  DesktopRingTonePresetId,
} from '../shared/ipc';

const RING_TONE_PRESETS: ReadonlyArray<DesktopRingTonePresetId> = [
  'classic',
  'soft',
  'urgent',
  'silent',
];

export const DEFAULT_GENERAL_PREFERENCES: DesktopGeneralPreferences = {
  autoStart: false,
  autoLogin: true,
  alwaysOnTop: false,
  closeToTray: true,
  ringTonePresetId: 'classic',
};

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function asRingTonePresetId(value: unknown): DesktopRingTonePresetId {
  if (typeof value === 'string' && (RING_TONE_PRESETS as ReadonlyArray<string>).includes(value)) {
    return value as DesktopRingTonePresetId;
  }
  return DEFAULT_GENERAL_PREFERENCES.ringTonePresetId;
}

export function normalizeGeneralPreferences(
  input: Partial<DesktopGeneralPreferences> | null | undefined,
): DesktopGeneralPreferences {
  const source = input ?? {};
  return {
    autoStart: asBool(source.autoStart, DEFAULT_GENERAL_PREFERENCES.autoStart),
    autoLogin: asBool(source.autoLogin, DEFAULT_GENERAL_PREFERENCES.autoLogin),
    alwaysOnTop: asBool(source.alwaysOnTop, DEFAULT_GENERAL_PREFERENCES.alwaysOnTop),
    closeToTray: asBool(source.closeToTray, DEFAULT_GENERAL_PREFERENCES.closeToTray),
    ringTonePresetId: asRingTonePresetId(source.ringTonePresetId),
  };
}

export class GeneralPreferencesStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, 'general-preferences.json');
  }

  async load(): Promise<DesktopGeneralPreferences> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return normalizeGeneralPreferences(
        JSON.parse(raw) as Partial<DesktopGeneralPreferences>,
      );
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
        return DEFAULT_GENERAL_PREFERENCES;
      }
      throw error;
    }
  }

  async save(input: DesktopGeneralPreferences): Promise<DesktopGeneralPreferences> {
    const next = normalizeGeneralPreferences(input);
    await mkdir(this.userDataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}
