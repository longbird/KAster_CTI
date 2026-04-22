import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function persistArtifact(tempDir: string, fileName: string, payload: Uint8Array) {
  await mkdir(tempDir, { recursive: true });
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, payload);
  return filePath;
}

export async function verifySha256(filePath: string, expectedSha256: string) {
  const hash = createHash('sha256');

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  return hash.digest('hex') === expectedSha256;
}
