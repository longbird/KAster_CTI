import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DesktopCallPreferences } from '../shared/ipc';

const DEFAULT_CALL_PREFERENCES: DesktopCallPreferences = {
  autoAnswerSeconds: 0,
  autoRejectSeconds: 0,
  autoStatusAfterCallSeconds: 0,
};

const MIN_SECONDS = 0;
const MAX_SECONDS = 60;

function clampSeconds(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, Math.floor(value)));
}

function normalize(input: Partial<DesktopCallPreferences>): DesktopCallPreferences {
  return {
    autoAnswerSeconds: clampSeconds(input.autoAnswerSeconds),
    autoRejectSeconds: clampSeconds(input.autoRejectSeconds),
    autoStatusAfterCallSeconds: clampSeconds(input.autoStatusAfterCallSeconds),
  };
}

export class CallPreferencesStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, 'call-preferences.json');
  }

  async load(): Promise<DesktopCallPreferences> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return normalize({
        ...DEFAULT_CALL_PREFERENCES,
        ...(JSON.parse(raw) as Partial<DesktopCallPreferences>),
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
        return DEFAULT_CALL_PREFERENCES;
      }
      throw error;
    }
  }

  async save(input: DesktopCallPreferences): Promise<DesktopCallPreferences> {
    const next = normalize(input);
    await mkdir(this.userDataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}
