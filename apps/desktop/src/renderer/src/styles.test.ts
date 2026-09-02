import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 개행은 체크아웃 설정에 따라 CRLF 로 내려올 수 있다.
const css = readFileSync(join(__dirname, 'styles.css'), 'utf8').replace(/\r\n/g, '\n');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} 규칙이 없다`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
}

describe('desktop renderer styles', () => {
  it('keeps native status select options readable on Windows', () => {
    const source = readFileSync(join(__dirname, 'styles.css'), 'utf8');

    expect(source).toMatch(/\.agent-status-select option\s*{[\s\S]*background:\s*#ffffff/);
    expect(source).toMatch(/\.agent-status-select option\s*{[\s\S]*color:\s*#111827/);
  });
});

describe('데스크톱 렌더러 색', () => {
  // 이 값들은 어두운 유리 배경을 전제로 고른 색이었는데, 실제 표면은 흰 .panel 이다.
  // 흰 글자가 흰 배경에 놓여 취소 버튼과 입력칸이 보이지 않았다.
  const DARK_GLASS = ['#d9ebe1', '#c7d9ce', '#a5bdb0', '#9fbbb0', '#ffb3b3', '#fca5a5'];

  it.each(DARK_GLASS)('어두운 배경용 %s 을(를) 더 쓰지 않는다', (hex) => {
    expect(css).not.toContain(hex);
  });

  it('취소 버튼이 표면 토큰을 쓴다', () => {
    const body = rule('.secondary-button');
    expect(body).toContain('background: var(--surface-subtle)');
    expect(body).toContain('color: var(--text)');
  });

  it('입력칸 테두리와 배경이 보인다', () => {
    const body = rule('.field input');
    expect(body).toContain('border: 1px solid var(--border)');
    expect(body).toContain('background: var(--surface-subtle)');
  });

  // 채우기용 --danger 는 흰 글자를 얹는 색이라, 표면 위 글자에 그대로 쓰면
  // 다크에서 대비가 모자란다. 글자용 토큰을 따로 둔다.
  it('표면 위 빨간 글자는 --danger-fg 를 쓴다', () => {
    expect(css).toMatch(/--danger-fg:\s*#ba2f36/);
    expect(css).toMatch(/--danger-fg:\s*#ff8b8b/);
    expect(css).not.toContain('color: #c9474f');
  });

  it('초점 표시 규칙이 있다', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--primary\)/);
  });
});
