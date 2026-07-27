import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { RecordingStorageService } from './recording-storage.service';

describe('RecordingStorageService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaster-rec-storage-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('maps a relative REC_FILE under the configured recording root and computes sha256', async () => {
    const recFile = '2026/07/27/linkedid-uniqueid.wav';
    const absolute = path.join(tmpDir, recFile);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, 'recording-bytes');

    const service = new RecordingStorageService(new ConfigService({
      RECORDING_STORAGE_ROOT: tmpDir,
    }));

    const inspected = await service.inspectLocalFile(recFile);

    expect(inspected.filePath).toBe(absolute);
    expect(inspected.fileName).toBe('linkedid-uniqueid.wav');
    expect(inspected.fileSizeBytes).toBe(15);
    expect(inspected.checksumSha256).toBe('1a656a301805a7df373828a001d069b7da8442a1428e756de4f8226a821f81ae');
  });
});
