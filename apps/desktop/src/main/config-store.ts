import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeCenterConfig } from '../shared/center-config';

export interface PersistedDesktopConfig {
  serverUrl: string;
  channel: string;
  deviceId: string;
}

export class DesktopConfigStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, 'desktop-config.json');
  }

  async load(): Promise<PersistedDesktopConfig | null> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as PersistedDesktopConfig;
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(input: { serverUrl: string; channel?: string }): Promise<PersistedDesktopConfig> {
    const normalized = normalizeCenterConfig(input);
    const current = await this.load();
    const next: PersistedDesktopConfig = {
      ...normalized,
      deviceId: current?.deviceId ?? randomUUID(),
    };

    await mkdir(this.userDataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}
