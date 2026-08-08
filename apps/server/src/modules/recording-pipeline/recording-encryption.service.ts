import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';

const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface RecordingEncryptionResult {
  encryptionStatus: 'NONE' | 'ENCRYPTED';
  encryptedFilePath: string | null;
  keyRef: string | null;
}

export interface RecordingDecryptStreamResult {
  stream: NodeJS.ReadableStream;
  size: number;
}

@Injectable()
export class RecordingEncryptionService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('RECORDING_ENCRYPTION_ENABLED', 'false') === 'true';
  }

  async encryptFile(filePath: string): Promise<RecordingEncryptionResult> {
    if (!this.isEnabled()) {
      return { encryptionStatus: 'NONE', encryptedFilePath: null, keyRef: null };
    }

    const key = this.loadKey();
    const iv = randomBytes(GCM_IV_BYTES);
    const encryptedFilePath = this.resolveEncryptedFilePath(filePath);
    await fs.mkdir(path.dirname(encryptedFilePath), { recursive: true });
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    await pipeline(createReadStream(filePath), cipher, createWriteStream(encryptedFilePath));
    const tag = cipher.getAuthTag();
    await fs.appendFile(encryptedFilePath, Buffer.concat([iv, tag]));
    await fs.unlink(filePath);

    return {
      encryptionStatus: 'ENCRYPTED',
      encryptedFilePath,
      keyRef: this.config.get<string>('RECORDING_ENCRYPTION_KEY_REF', 'local-env'),
    };
  }

  async decryptFileToBuffer(encryptedFilePath: string): Promise<Buffer> {
    const key = this.loadKey();
    const encrypted = await fs.readFile(encryptedFilePath);
    if (encrypted.length <= GCM_IV_BYTES + GCM_TAG_BYTES) {
      throw new Error('encrypted recording payload is too short');
    }

    const trailerOffset = encrypted.length - GCM_IV_BYTES - GCM_TAG_BYTES;
    const payload = encrypted.subarray(0, trailerOffset);
    const iv = encrypted.subarray(trailerOffset, trailerOffset + GCM_IV_BYTES);
    const tag = encrypted.subarray(trailerOffset + GCM_IV_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]);
  }

  async openDecryptedReadStream(encryptedFilePath: string): Promise<RecordingDecryptStreamResult> {
    const key = this.loadKey();
    const stat = await fs.stat(encryptedFilePath);
    if (stat.size <= GCM_IV_BYTES + GCM_TAG_BYTES) {
      throw new Error('encrypted recording payload is too short');
    }

    const payloadSize = stat.size - GCM_IV_BYTES - GCM_TAG_BYTES;
    const trailer = Buffer.alloc(GCM_IV_BYTES + GCM_TAG_BYTES);
    const handle = await fs.open(encryptedFilePath, 'r');
    try {
      await handle.read(trailer, 0, trailer.length, payloadSize);
    } finally {
      await handle.close();
    }

    const iv = trailer.subarray(0, GCM_IV_BYTES);
    const tag = trailer.subarray(GCM_IV_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const stream = createReadStream(encryptedFilePath, { start: 0, end: payloadSize - 1 }).pipe(decipher);
    return { stream, size: payloadSize };
  }

  private resolveEncryptedFilePath(filePath: string): string {
    const encryptedRoot = this.config.get<string>('RECORDING_ENCRYPTED_STORAGE_ROOT', '').trim();
    if (!encryptedRoot) {
      return `${filePath}.enc`;
    }

    const sourceRoot = this.config.get<string>('RECORDING_STORAGE_ROOT', '').trim();
    if (sourceRoot) {
      const relative = path.relative(path.resolve(sourceRoot), path.resolve(filePath));
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        return path.join(encryptedRoot, `${relative}.enc`);
      }
    }

    return path.join(encryptedRoot, `${path.basename(filePath)}.enc`);
  }

  private loadKey(): Buffer {
    const raw = this.config.get<string>('RECORDING_ENCRYPTION_KEY', '');
    if (!raw) {
      throw new Error('RECORDING_ENCRYPTION_KEY is required when recording encryption is enabled');
    }

    const decoded =
      /^[0-9a-fA-F]{64}$/.test(raw)
        ? Buffer.from(raw, 'hex')
        : Buffer.from(raw, 'base64');

    if (decoded.length !== KEY_BYTES) {
      throw new Error('RECORDING_ENCRYPTION_KEY must decode to 32 bytes');
    }
    return decoded;
  }
}
