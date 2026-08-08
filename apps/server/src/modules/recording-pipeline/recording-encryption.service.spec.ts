import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RecordingEncryptionService } from './recording-encryption.service';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function configFromObject(values: Record<string, string>) {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as any;
}

describe('RecordingEncryptionService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaster-rec-encryption-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('encrypts into a separate storage root, deletes the source, and decrypts as a stream', async () => {
    const sourceRoot = path.join(tmpDir, 'plain');
    const encryptedRoot = path.join(tmpDir, 'encrypted');
    const sourcePath = path.join(sourceRoot, '2026', '08', '08', 'call.wav');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'recording-payload');

    const service = new RecordingEncryptionService(configFromObject({
      RECORDING_ENCRYPTION_ENABLED: 'true',
      RECORDING_STORAGE_ROOT: sourceRoot,
      RECORDING_ENCRYPTED_STORAGE_ROOT: encryptedRoot,
      RECORDING_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('hex'),
    }));

    const encrypted = await service.encryptFile(sourcePath);

    expect(fs.existsSync(sourcePath)).toBe(false);
    expect(encrypted.encryptionStatus).toBe('ENCRYPTED');
    expect(encrypted.encryptedFilePath).toBe(path.join(encryptedRoot, '2026', '08', '08', 'call.wav.enc'));

    const decrypted = await service.openDecryptedReadStream(encrypted.encryptedFilePath!);
    await expect(streamToBuffer(decrypted.stream)).resolves.toEqual(Buffer.from('recording-payload'));
    expect(decrypted.size).toBe(Buffer.byteLength('recording-payload'));
  });
});
