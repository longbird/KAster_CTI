import { readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

/**
 * 장애 대응 모드에서 무엇을 막고 무엇을 열어둘지는 정책 결정이다.
 * 새 컨트롤러가 추가될 때 조용히 빠지지 않도록 그 결정을 여기서 고정한다.
 *
 * 열어두는 쪽이 더 중요하다 — 제1원칙은 "진행 중인 통화 제어는 모든 모드에서 허용" 이다.
 */
const SRC = join(__dirname, '../src');

/** 클래스 전체가 설정 쓰기인 컨트롤러 */
const FULLY_GATED = [
  'admin.controller.ts',
  'asterisk-config.controller.ts',
  'queues.controller.ts',
  'integrations.controller.ts',
  'outbound-rules.controller.ts',
  'share-rules.controller.ts',
  'sms-templates.controller.ts',
];

/** 설정 쓰기와 운영 쓰기가 섞여 메서드 단위로 붙인 컨트롤러 */
const PARTIALLY_GATED = ['agents.controller.ts'];

/** 의도적으로 막지 않는 컨트롤러와 그 이유 */
const INTENTIONALLY_OPEN: Record<string, string> = {
  'calls.controller.ts': '제1원칙 — 진행 중인 통화 제어는 모든 모드에서 허용',
  'client-call-commands.controller.ts': '제1원칙 — 클라이언트 발신 명령',
  'auth.controller.ts': 'allowNewLogin 은 별도 축이며 강제 여부가 운영 판단 사항 (runbook 6장)',
  'customers.controller.ts': '고객 업무 데이터이지 설정이 아니다',
  'agent-updates.controller.ts': '데스크톱 앱 런타임 경로(세션·다운로드·리포트)',
};

function controllersWithWrites(): string[] {
  return globSync('**/*.controller.ts', { cwd: SRC })
    .filter((rel) => /@(Post|Put|Patch|Delete)\(/.test(readFileSync(join(SRC, rel), 'utf8')))
    .map((rel) => rel.split(/[\\/]/).pop() as string);
}

describe('WriteAvailabilityGuard 적용 범위', () => {
  const found = controllersWithWrites();

  it('쓰기 엔드포인트를 가진 컨트롤러가 모두 분류돼 있다', () => {
    const classified = new Set([
      ...FULLY_GATED,
      ...PARTIALLY_GATED,
      ...Object.keys(INTENTIONALLY_OPEN),
    ]);
    const unclassified = found.filter((name) => !classified.has(name));

    // 새 컨트롤러를 추가했다면 위 세 목록 중 하나에 넣고, 열어두는 경우 이유를 적을 것.
    expect(unclassified).toEqual([]);
  });

  it.each(FULLY_GATED)('%s 는 클래스 레벨로 차단된다', (name) => {
    const rel = globSync(`**/${name}`, { cwd: SRC })[0];
    const text = readFileSync(join(SRC, rel), 'utf8');

    expect(text).toMatch(/@RequiresWriteAvailability\('general'\)\s*\r?\n\s*(\/\/[^\n]*\r?\n\s*)*export class/);
  });

  it.each(PARTIALLY_GATED)('%s 는 설정 쓰기에만 붙어 있다', (name) => {
    const rel = globSync(`**/${name}`, { cwd: SRC })[0];
    const text = readFileSync(join(SRC, rel), 'utf8');

    expect(text).toContain("@RequiresWriteAvailability('general')");
    // 상담원 상태/DND 는 통화 운영이라 장애 중에도 열려 있어야 한다.
    expect(text).not.toMatch(/@RequiresWriteAvailability\('general'\)\s*\r?\n\s*@Post\(':agentId\/status'\)/);
    expect(text).not.toMatch(/@RequiresWriteAvailability\('general'\)\s*\r?\n\s*@Post\(':agentId\/dnd'\)/);
  });

  it.each(Object.keys(INTENTIONALLY_OPEN))('%s 는 의도적으로 열려 있다', (name) => {
    const rel = globSync(`**/${name}`, { cwd: SRC })[0];
    const text = readFileSync(join(SRC, rel), 'utf8');

    expect(text).not.toContain('RequiresWriteAvailability');
  });
});
