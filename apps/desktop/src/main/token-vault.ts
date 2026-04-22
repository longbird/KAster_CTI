import { safeStorage } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DesktopAuthSession } from './auth-client';

export class TokenVault {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, 'desktop-session.bin');
  }

  async load(): Promise<DesktopAuthSession | null> {
    try {
      const raw = await readFile(this.filePath);
      const json = this.decode(raw);
      return JSON.parse(json) as DesktopAuthSession;
    } catch {
      return null;
    }
  }

  async save(session: DesktopAuthSession): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true });
    const payload = this.encode(JSON.stringify(session));
    await writeFile(this.filePath, payload);
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }

  private encode(json: string): Buffer {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(json);
    }

    return Buffer.from(json, 'utf8');
  }

  private decode(raw: Buffer): string {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw);
    }

    return raw.toString('utf8');
  }
}
