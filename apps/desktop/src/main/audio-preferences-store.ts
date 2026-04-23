import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DesktopAudioPreferences } from '../shared/ipc';

const DEFAULT_AUDIO_PREFERENCES: DesktopAudioPreferences = {
  inputDeviceId: null,
  outputDeviceId: null,
  ringDeviceId: null,
  echoCancellation: true,
  noiseSuppression: true,
};

export class AudioPreferencesStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, 'audio-preferences.json');
  }

  async load(): Promise<DesktopAudioPreferences> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return {
        ...DEFAULT_AUDIO_PREFERENCES,
        ...(JSON.parse(raw) as Partial<DesktopAudioPreferences>),
      };
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
        return DEFAULT_AUDIO_PREFERENCES;
      }
      throw error;
    }
  }

  async save(input: DesktopAudioPreferences): Promise<DesktopAudioPreferences> {
    const next = {
      ...DEFAULT_AUDIO_PREFERENCES,
      ...input,
    };

    await mkdir(this.userDataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}
