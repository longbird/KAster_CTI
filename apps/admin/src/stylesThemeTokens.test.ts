import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
}

describe('admin theme tokens', () => {
  // 정의되지 않은 토큰을 참조하면 그 줄은 조용히 무효가 된다.
  // --t-small 이 실제로 그렇게 사이드 하위 메뉴 크기를 먹었다.
  it('defines every custom property it references', () => {
    const defined = new Set(Array.from(css.matchAll(/(--[\w-]+)\s*:/g), (m) => m[1]));
    const referenced = new Set(Array.from(css.matchAll(/var\(\s*(--[\w-]+)/g), (m) => m[1]));
    const missing = Array.from(referenced).filter((name) => !defined.has(name));
    expect(missing).toEqual([]);
  });

  // 다크용 signal 초록을 흰 배경에 그대로 쓰면 1.6:1 이 된다.
  // 선택된 메뉴 항목 · .k-chip.is-available · 로그인 히어로 배지가 한꺼번에 걸린다.
  it('overrides the signal colour for the light theme', () => {
    const light = block("[data-theme='light']");
    expect(light).toMatch(/--signal:\s*#15803d/);
    expect(light).not.toMatch(/--signal:\s*#4ade80/);
  });

  it('overrides the focus ring for the light theme', () => {
    const light = block("[data-theme='light']");
    expect(light).toMatch(/--focus-ring:\s*0 0 0 2px rgba\(21, 128, 61/);
  });

  // 통화 카드는 div 라 브라우저 기본 초점 표시가 없다.
  it('gives the call card a visible keyboard focus ring', () => {
    expect(css).toMatch(/\.call-card:focus-visible\s*\{[^}]*box-shadow:\s*var\(--focus-ring\)/);
  });
});
