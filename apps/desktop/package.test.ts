import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(join(import.meta.dirname, 'package.json'), 'utf8'),
) as {
  description?: string;
  author?: string;
  main: string;
  scripts: Record<string, string>;
};

describe('desktop package manifest', () => {
  it('main 엔트리가 electron-vite production 산출물을 가리킨다', () => {
    expect(packageJson.main).toBe('out/main/index.js');
  });

  it('Windows 패키징 스크립트를 제공한다', () => {
    expect(packageJson.scripts).toMatchObject({
      'dist:win': 'electron-builder --config builder.config.ts --win nsis portable --x64',
      'pack:dir': 'electron-builder --config builder.config.ts --dir',
      'sign:internal': 'powershell -ExecutionPolicy Bypass -File .\\scripts\\sign-internal.ps1',
      'verify:signature': 'powershell -ExecutionPolicy Bypass -File .\\scripts\\verify-signature.ps1',
      'dist:win:signed': 'npm run dist:win && npm run sign:internal && npm run verify:signature',
    });
  });

  it('배포용 기본 메타데이터를 포함한다', () => {
    expect(packageJson.description).toBe('KAster CTI desktop agent runtime for Windows call center operations');
    expect(packageJson.author).toBe('KAster Operations');
  });
});
