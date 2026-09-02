import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { darkTheme, lightTheme } from './shared/theme/antdTheme';

// 개행을 정규화한다. 체크아웃 설정에 따라 작업본이 CRLF 로 내려오면
// 여러 줄 셀렉터('h2.ant-typography,\nh4.ant-typography')를 못 찾는다.
const css = readFileSync(join(__dirname, 'styles.css'), 'utf8').replace(/\r\n/g, '\n');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} 규칙이 없다`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

function scaleToken(name: string): string {
  const root = css.slice(css.indexOf(':root {'));
  const m = root.slice(0, root.indexOf('\n}')).match(new RegExp(`${name}:\\s*(\\d+)px`));
  expect(m, `${name} 이 :root 에 없다`).toBeTruthy();
  return m![1];
}

describe('타이포 스케일', () => {
  // 선언만 되고 아무도 안 쓰던 스케일이 실제 크기를 정하게 한다.
  it('화면 제목 크기는 --t-h2 에서 온다', () => {
    expect(rule('.adm-page-title')).toContain('font-size: var(--t-h2)');
    expect(rule('.login-hero__title.ant-typography')).toContain('font-size: var(--t-h2)');
  });

  // antd Title 레벨별 크기는 fontSize 13 파생값(18 · 14px)이라 토큰과 어긋난다.
  // 고정하지 않으면 같은 화면 제목이 22px 과 18px 로 갈린다.
  it('antd Title 을 토큰 스케일에 고정한다', () => {
    const h4 = rule('h2.ant-typography,\nh4.ant-typography');
    expect(h4).toContain('font-size: var(--t-h2)');
    expect(rule('h5.ant-typography')).toContain('font-size: var(--t-h5)');
  });

  it('카드 제목은 antd 와 CSS 가 같은 크기다', () => {
    expect(rule('.adm-card-head h4')).toContain('font-size: var(--t-h5)');
    const h5 = Number(scaleToken('--t-h5'));
    expect(darkTheme.components?.Card?.headerFontSize).toBe(h5);
    expect(lightTheme.components?.Card?.headerFontSize).toBe(h5);
  });
});

describe('KPI 숫자', () => {
  // 같은 성격의 수치가 22/700 · 22/400 · 28/500 세 벌로 나갔다.
  // 처리는 하나(mono · 500 · tabular · -.015em)로 두고 크기만 스케일에서 고른다.
  const kpiValues = [
    '.adm-kpi-value',
    '.dashboard-compact__kpi-cell .value',
    '.settings-portal__summary strong',
    '.ant-statistic-content',
  ];

  it.each(kpiValues)('%s 는 mono · 500 · tabular 한 벌을 쓴다', (selector) => {
    const body = rule(selector);
    expect(body).toContain('font-family: var(--font-mono)');
    expect(body).toContain('font-weight: 500');
    expect(body).toContain('letter-spacing: -.015em');
    expect(body).toContain('font-variant-numeric: tabular-nums');
  });

  it.each(kpiValues)('%s 크기는 스케일 토큰에서 온다', (selector) => {
    expect(rule(selector)).toMatch(/font-size: var\(--t-h[12]\)/);
  });

  it('KPI 라벨은 전부 --t-micro 다', () => {
    expect(rule('.dashboard-compact__kpi-cell .label')).toContain('font-size: var(--t-micro)');
    expect(rule('.adm-kpi-label')).toContain('font-size: var(--t-micro)');
    expect(css).toMatch(/\.ant-statistic-title \{[^}]*font-size: var\(--t-micro\)/);
  });
});
