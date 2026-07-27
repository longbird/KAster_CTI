import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import * as path from 'path';

export interface InspectedRecordingFile {
  filePath: string;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  checksumSha256: string;
}

@Injectable()
export class RecordingStorageService {
  constructor(private readonly config: ConfigService) {}

  resolveLocalPath(recFile: string): string {
    if (path.isAbsolute(recFile)) {
      return path.normalize(recFile);
    }
    const root = this.config.get<string>('RECORDING_STORAGE_ROOT', '/var/spool/asterisk/monitor');
    return path.normalize(path.join(root, recFile));
  }

  async inspectLocalFile(recFile: string): Promise<InspectedRecordingFile> {
    const filePath = this.resolveLocalPath(recFile);
    const stat = await fs.stat(filePath);
    const checksumSha256 = await this.calculateSha256(filePath);
    const fileName = path.basename(filePath);
    const fileFormat = path.extname(fileName).replace(/^\./, '').toLowerCase() || 'wav';

    return {
      filePath,
      fileName,
      fileFormat,
      fileSizeBytes: stat.size,
      checksumSha256,
    };
  }

  async calculateSha256(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    return hash.digest('hex');
  }
}
