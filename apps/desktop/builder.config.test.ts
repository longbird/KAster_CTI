import { describe, expect, it } from 'vitest';
import builderConfig from './builder.config';

describe('desktop builder config', () => {
  it('Windows 배포용 nsis 와 portable 타겟을 노출한다', () => {
    expect(builderConfig.appId).toBe('com.kaster.cti.desktop');
    expect(builderConfig.productName).toBe('KAster Agent');
    expect(builderConfig.win?.target).toEqual([
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'portable',
        arch: ['x64'],
      },
    ]);
  });

  it('electron-vite out 산출물을 main 엔트리와 함께 패키징한다', () => {
    expect(builderConfig.files).toEqual(expect.arrayContaining(['out/**/*', 'package.json']));
    expect(builderConfig.extraMetadata).toMatchObject({
      main: 'out/main/index.js',
    });
    expect(builderConfig.directories).toMatchObject({
      output: 'release',
    });
    expect(builderConfig.extraResources).toEqual([
      {
        from: 'build/icon.png',
        to: 'icon.png',
      },
    ]);
    expect(builderConfig.win).toMatchObject({
      icon: 'build/icon.ico',
    });
    expect(builderConfig.nsis).toMatchObject({
      installerIcon: 'build/icon.ico',
      uninstallerIcon: 'build/icon.ico',
    });
  });
});
