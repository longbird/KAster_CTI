import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop BrowserWindow preload options', () => {
  it('disables renderer sandbox so the preload bridge can expose desktopApi', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

    expect(source).toMatch(/webPreferences:\s*{[\s\S]*preload:\s*join\(__dirname,\s*['"]\.\.\/preload\/index\.mjs['"]\)/);
    expect(source).toMatch(/webPreferences:\s*{[\s\S]*sandbox:\s*false/);
  });

  it('allows media permission requests for microphone device enumeration', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

    expect(source).toMatch(/setPermissionRequestHandler/);
    expect(source).toMatch(/setPermissionCheckHandler/);
    expect(source).toMatch(/permission === ['"]media['"]/);
  });

  it('hides the application menu in the agent desktop window', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

    expect(source).toMatch(/Menu\.setApplicationMenu\(null\)/);
    expect(source).toMatch(/setMenuBarVisibility\(false\)/);
  });
});
