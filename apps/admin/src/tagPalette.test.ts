import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { describe, expect, it } from 'vitest';

import { darkTheme, lightTheme } from './shared/theme/antdTheme';
import {
  AGENT_STATUS_TONE,
  MISSED_REASON_TONE,
  SESSION_STATUS_TONE,
  TRANSFER_PHASE_TONE,
  type TagTone,
} from './shared/ui/tagTone';

const SRC = __dirname;
const THEME_FILE = 'shared/theme/antdTheme.ts';

function sourceFiles(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!['.ts', '.tsx'].includes(extname(name))) continue;
      if (name.includes('.test.')) continue;
      out.push(p);
    }
  })(SRC);
  return out;
}

const files = sourceFiles().map((p) => [relative(SRC, p).replace(/\\/g, '/'), readFileSync(p, 'utf8')] as const);

const css = readFileSync(join(SRC, 'styles.css'), 'utf8');

function lightToken(name: string): string {
  const block = css.slice(css.indexOf("[data-theme='light'] {"));
  const m = block.slice(0, block.indexOf('\n}')).match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  expect(m, `${name} 이 라이트 블록에 없다`).toBeTruthy();
  return m![1].toLowerCase();
}

function rootToken(name: string): string {
  const block = css.slice(css.indexOf(':root {'));
  const m = block.slice(0, block.indexOf('\n}')).match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  expect(m, `${name} 이 :root 에 없다`).toBeTruthy();
  return m![1].toLowerCase();
}

const ALLOWED_TONES: TagTone[] = ['success', 'processing', 'warning', 'error', 'default'];

describe('태그 색 어휘', () => {
  // antd 팔레트 이름은 테마를 따라가지 않아서, 같은 뜻이 화면마다 다른 색으로 나갔다.
  // status preset(success/processing/warning/error/default)만 쓴다 — 토큰에서 파생된다.
  it('antd 팔레트 이름을 쓰지 않는다', () => {
    const palette = /(['"])(green|blue|red|orange|gold|purple|cyan|magenta|volcano|lime|geekblue)\1/;
    const offenders = files.filter(([, text]) => palette.test(text)).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  // 색은 토큰에서만 나온다. 인라인 hex 는 테마를 따라가지 않아 라이트에서 안 보이거나
  // 다크에서 튄다 — 2026-08 에 실제로 그랬다.
  it('테마 파일 밖에서는 hex 를 직접 쓰지 않는다', () => {
    const hex = /#[0-9a-fA-F]{6}\b/;
    const offenders = files
      .filter(([name]) => name !== THEME_FILE)
      .filter(([, text]) => hex.test(text))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('공유 톤 맵은 다섯 가지 톤만 쓴다', () => {
    const maps = { AGENT_STATUS_TONE, SESSION_STATUS_TONE, TRANSFER_PHASE_TONE, MISSED_REASON_TONE };
    for (const [mapName, map] of Object.entries(maps)) {
      for (const [key, tone] of Object.entries(map)) {
        expect(ALLOWED_TONES, `${mapName}.${key}`).toContain(tone);
      }
    }
  });

  // Tag 의 success/processing/warning/error 는 이 넷에서 파생된다
  // (antd/lib/tag/style/statusCmp.js). 어긋나면 CSS 칩과 antd 태그가 다른 색이 된다.
  it('antd 시드 색이 styles.css 토큰과 같다', () => {
    expect(darkTheme.token?.colorSuccess).toBe(rootToken('--signal'));
    expect(darkTheme.token?.colorInfo).toBe(rootToken('--accent-info'));
    expect(darkTheme.token?.colorWarning).toBe(rootToken('--accent-warn'));
    expect(darkTheme.token?.colorError).toBe(rootToken('--accent-danger'));

    expect(lightTheme.token?.colorSuccess).toBe(lightToken('--signal'));
    expect(lightTheme.token?.colorInfo).toBe(lightToken('--accent-info'));
    expect(lightTheme.token?.colorWarning).toBe(lightToken('--accent-warn'));
    expect(lightTheme.token?.colorError).toBe(lightToken('--accent-danger'));
  });
});
