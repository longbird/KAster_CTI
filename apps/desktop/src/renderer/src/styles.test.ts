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

describe('치수', () => {
  // px 10가지와 rem 12가지가 섞여 22가지였다. 0.76rem(12.16) · 0.78rem(12.48) 처럼
  // 눈에 보이지 않는 차이가 어휘만 늘렸다.
  it('글자 크기를 스케일 토큰으로만 정한다', () => {
    expect(css).not.toMatch(/font-size: *[0-9.]+(px|rem)/);
  });

  it.each(['--t-micro', '--t-caption', '--t-small', '--t-body', '--t-lg', '--t-h3', '--t-h2', '--t-h1'])(
    '%s 가 정의돼 있다',
    (token) => {
      expect(css).toMatch(new RegExp(`${token}:\\s*\\d+px`));
    },
  );

  // 참조만 되고 정의가 없어 폴백(흰 4%)으로 떨어졌다. 흰 판 위에서 hover 가 무반응이었다.
  it('--surface-hover 가 두 테마 모두에 있다', () => {
    expect(css.match(/--surface-hover:/g)?.length).toBe(2);
    expect(css).not.toContain('var(--surface-hover, ');
  });

  // 입력칸이 반지름 14px(옛 유리)과 4px(로그인) 두 벌이었다.
  it('입력칸 규격이 한 벌이다', () => {
    expect(css).not.toMatch(/border-radius: *14px/);
    expect(rule('.field input')).toContain('border-radius: 4px');
    expect(rule('.desktop-login-field input')).toContain('border-radius: 4px');
  });
});

describe('브랜드 색', () => {
  // 셸은 --primary(steel blue), 로그인 화면은 에메랄드, 옛 화면은 민트 그라디언트로
  // 세 벌이 갈려 있었다. --primary 한 벌로 모은다.
  const OFF_BRAND = ['#4ade80', '#22c55e', '#03120b', '#86d0a7', '#4a9c88', '#092018'];

  it.each(OFF_BRAND)('토큰 밖 브랜드색 %s 을(를) 쓰지 않는다', (hex) => {
    expect(css).not.toContain(hex);
  });

  it.each([
    ['.desktop-brand-box', '브랜드 마크'],
    ['.desktop-login-submit', '로그인 버튼'],
    ['.primary-button', '기본 버튼'],
  ])('%s (%s) 가 --primary 를 채우기로 쓴다', (selector) => {
    const re = new RegExp(`\\${selector} \\{[^}]*background: var\\(--primary\\);[^}]*color: var\\(--primary-text\\)`);
    expect(css).toMatch(re);
  });

  it('로그인 입력 포커스가 셸과 같은 규격이다', () => {
    const shell = /\.desktop-console input:focus[\s\S]*?box-shadow: 0 0 0 1px var\(--primary\)/;
    const login = /\.desktop-login-field input:focus\s*\{[^}]*box-shadow: 0 0 0 1px var\(--primary\)/;
    expect(css).toMatch(shell);
    expect(css).toMatch(login);
  });
});
