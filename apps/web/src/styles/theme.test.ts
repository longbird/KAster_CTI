import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const css = readFileSync(join(__dirname, 'index.css'), 'utf8').replace(/\r\n/g, '\n');
const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');

function sources(): [string, string][] {
  const out: [string, string][] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!['.ts', '.tsx'].includes(extname(name)) || name.includes('.test.')) continue;
      out.push([relative(SRC, p).replace(/\\/g, '/'), readFileSync(p, 'utf8')]);
    }
  })(SRC);
  return out;
}

const files = sources();

function block(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `${selector} 블록이 없다`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
}

const TONES = ['--tone-ok', '--tone-info', '--tone-warn', '--tone-danger', '--tone-neutral'];

describe('테마 토큰', () => {
  // 라이트만 MD3 초기 생성값(파랑)으로 남아, 같은 화면에 파랑과 초록이 같이 떴다.
  it('라이트 primary 가 별칭·그라디언트와 같은 계열이다', () => {
    expect(block(":root,\n[data-theme='light']")).toMatch(/--color-primary:\s*4 120 87/);
    expect(css).not.toContain('0 63 177');
  });

  it.each(TONES)('%s 가 두 테마 모두에 있다', (token) => {
    expect(css.match(new RegExp(`${token}:`, 'g'))?.length).toBe(2);
  });

  // 그라디언트 위 흰 글자는 다크 에메랄드에서 1.75:1 이었다.
  it('그라디언트 전경색이 테마마다 있다', () => {
    expect(css.match(/--gradient-primary-fg:/g)?.length).toBe(2);
    expect(css).toMatch(/\.btn-primary-gradient\s*\{[^}]*color: var\(--gradient-primary-fg\)/);
  });

  // 초 단위로 갱신되는 통화 목록에서 전 요소가 0.2초씩 보간됐다.
  it('전역 트랜지션을 걸지 않는다', () => {
    expect(css).not.toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*transition/);
  });

  it('초점 표시 규칙이 있다', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline: 2px solid rgb\(var\(--color-primary\)\)/);
  });

  // antd 만 다른 브랜드 색으로 뜨던 것을 막는다. 주석은 걷어내고 코드만 본다.
  it('antd 시드 색이 CSS 토큰과 같다', () => {
    const code = main.replace(/\/\/.*$/gm, '');
    const seed = (name: string) => {
      const m = code.match(new RegExp(`${name}: themeMode === 'dark' \\? '(#[0-9a-f]{6})' : '(#[0-9a-f]{6})'`));
      expect(m, `${name} 시드를 못 찾았다`).toBeTruthy();
      return { dark: m![1], light: m![2] };
    };

    expect(seed('colorPrimary')).toEqual({ dark: '#34d399', light: '#047857' });
    expect(seed('colorSuccess')).toEqual({ dark: '#34d399', light: '#047857' });
    expect(seed('colorInfo')).toEqual({ dark: '#58a6ff', light: '#2563eb' });
    expect(seed('colorWarning')).toEqual({ dark: '#d29922', light: '#b45309' });
    expect(seed('colorError')).toEqual({ dark: '#f85149', light: '#ba1a1a' });

    // 그 값이 CSS 의 --tone-* 라이트 값과 실제로 같은지 확인한다.
    const light = block(":root,\n[data-theme='light']");
    const tone = (name: string) => light.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`))?.[1];

    expect(tone('--tone-ok')).toBe('#047857');
    expect(tone('--tone-info')).toBe('#2563eb');
    expect(tone('--tone-warn')).toBe('#b45309');
    expect(tone('--tone-danger')).toBe('#ba1a1a');
  });
});

describe('테마를 따라가지 않는 값', () => {
  it('antd 팔레트 이름을 쓰지 않는다', () => {
    const palette = /(['"])(green|blue|red|orange|gold|purple|cyan|magenta|volcano|lime|geekblue)\1/;
    expect(files.filter(([, text]) => palette.test(text)).map(([n]) => n)).toEqual([]);
  });

  // 한 테마에만 맞는 Tailwind 색은 반대 테마에서 흰 판 · 검은 판이 된다.
  it('한쪽 테마 전용 Tailwind 색을 쓰지 않는다', () => {
    const lightOnly =
      /\b(bg|text|border|from|to|via|ring|divide)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d{2,3})?(\/\d+)?\b/;
    expect(files.filter(([, text]) => lightOnly.test(text)).map(([n]) => n)).toEqual([]);
  });

  it('main.tsx 밖에서 hex 를 직접 쓰지 않는다', () => {
    const offenders = files
      .filter(([name]) => name !== 'main.tsx')
      .filter(([, text]) => /#[0-9a-fA-F]{6}\b/.test(text))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  // text-[9px] ~ text-[20px] 여덟 가지가 임의값으로 흩어져 있었다.
  it('임의 글자 크기를 쓰지 않는다', () => {
    expect(files.filter(([, text]) => /text-\[\d+px\]/.test(text)).map(([n]) => n)).toEqual([]);
  });
});
