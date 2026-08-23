import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangeAgentStatusDto } from './change-agent-status.dto';

function constraintsFor(statusCode: unknown, reasonCode?: unknown): string[] {
  return validateSync(plainToInstance(ChangeAgentStatusDto, { statusCode, reasonCode }))
    .flatMap((error) => Object.keys(error.constraints ?? {}));
}

/**
 * 이 값은 `agentStatusHistory.statusCode` 로 그대로 들어간다 — `VarChar(32)` 다.
 * 길이를 안 보면 33자짜리가 Prisma 에서 터져 500 이 나가고, 빈 문자열은 "상태 없음"
 * 으로 읽혀 큐에서 조용히 빠진다. 둘 다 요청이 잘못된 것이므로 경계에서 막는다.
 *
 * 상태 코드의 <b>목록</b>은 여기서 막지 않는다. 서버에 정해진 목록이 없고
 * (`agentStatusHistory` 는 자유 문자열이다), 모르는 코드는 "행이 있으니 로그인해 있다" 로
 * 읽는 것이 `shouldPauseQueue` 의 설계다. 목록을 여기서 새로 만들면 판정이 두 벌이 된다.
 */
describe('ChangeAgentStatusDto', () => {
  it('정상 코드는 통과한다', () => {
    expect(constraintsFor('AVAILABLE')).toEqual([]);
    expect(constraintsFor('BREAK', 'LUNCH')).toEqual([]);
  });

  it('빈 값은 거부한다', () => {
    expect(constraintsFor('')).toContain('isNotEmpty');
    expect(constraintsFor('   ')).toContain('isNotEmpty');
  });

  it('DB 컬럼 길이를 넘기면 거부한다', () => {
    expect(constraintsFor('A'.repeat(32))).toEqual([]);
    expect(constraintsFor('A'.repeat(33))).toContain('maxLength');
  });

  it('사유 코드도 같은 한도를 지킨다', () => {
    expect(constraintsFor('BREAK', 'R'.repeat(33))).toContain('maxLength');
  });
});
