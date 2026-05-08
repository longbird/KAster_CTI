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

describe('desktop window mode bounds', () => {
  it('keeps compact and full compatibility aliases', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

    expect(source).toMatch(/mode === ['"]compact['"][\s\S]*return ['"]idle['"]/);
    expect(source).toMatch(/mode === ['"]full['"][\s\S]*return ['"]settings['"]/);
  });

  it('defines bounds for every contextual console mode', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

    expect(source).toContain('idle: { width: 440, height: 560, minWidth: 420, minHeight: 520 }');
    expect(source).toContain('ringing: { width: 440, height: 420, minWidth: 400, minHeight: 380 }');
    expect(source).toContain('talking: { width: 460, height: 620, minWidth: 420, minHeight: 540 }');
    expect(source).toContain('transferring: { width: 500, height: 640, minWidth: 440, minHeight: 560 }');
    expect(source).toContain('afterCall: { width: 460, height: 520, minWidth: 420, minHeight: 460 }');
    expect(source).toContain('settings: { width: 560, height: 720, minWidth: 500, minHeight: 640 }');
  });

  it('resizes contextual modes without recentering the user-moved window', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    const applyWindowModeSource = source.match(/function applyWindowMode[\s\S]*?\n}/)?.[0] ?? '';

    expect(applyWindowModeSource).toMatch(/setSize\(bounds\.width,\s*bounds\.height\)/);
    expect(applyWindowModeSource).not.toMatch(/\.center\(\)/);
  });

  it('opens utility windows independently from the main agent window', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    const openUtilityWindowSource = source.match(/function openUtilityWindow[\s\S]*?\n}/)?.[0] ?? '';

    expect(openUtilityWindowSource).not.toMatch(/parent:/);
  });

  it('does not focus the main window while forwarding DTMF from the keypad popup', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    const dtmfHandlerSource = source.match(/ipcMain\.handle\(['"]desktop:request-softphone-dtmf['"][\s\S]*?\n  }\);/)?.[0] ?? '';

    expect(dtmfHandlerSource).toContain("win.webContents.send('desktop:softphone-dtmf-request'");
    expect(dtmfHandlerSource).not.toMatch(/focusPrimaryWindow\(\)/);
  });
});
