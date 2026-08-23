import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SetQueueMembersDto } from '../src/modules/queues/dto/set-queue-members.dto';
import { CopyAgentPermissionsDto } from '../src/modules/agents/dto/copy-agent-permissions.dto';
import { PutShareRuleAgentsDto } from '../src/modules/share-rules/dto/put-share-rule-agents.dto';

/**
 * 시드가 만드는 ID 와 앱이 들고 있는 기본 테넌트 ID. 둘 다 v4 가 아니다 —
 * 사람이 읽을 수 있게 고정값으로 두었고, DB 의 `uuid` 컬럼은 이 값을 그대로 받는다.
 */
const SEEDED_AGENT_ID = '00000000-0000-0000-0000-000000000201';
const SEEDED_SUPERVISOR_ID = '00000000-0000-0000-0000-000000000202';
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const GENERATED_AGENT_ID = '687cab3d-e7c5-43a0-9986-f4a0788addb4';

function errorsFor(cls: any, payload: unknown): string[] {
  return validateSync(plainToInstance(cls, payload), { whitelist: true })
    .flatMap(function collect(error): string[] {
      return [
        ...Object.keys(error.constraints ?? {}),
        ...(error.children ?? []).flatMap(collect),
      ];
    });
}

/**
 * 실제로 막혔던 것: 관리자 화면에서 시드 계정(agent1001 · supervisor1)을 호분배룰에
 * 넣을 수 없었다. `@IsUUID()` 가 버전 4 만 받는데 시드 ID 는 버전 자리가 0 이다.
 *
 * DB 가 받아 주는 값을 API 가 거부하면, 넣어 둔 데이터를 API 로는 영영 가리킬 수 없다.
 * 경계 검증은 DB 계약보다 엄격할 이유가 없다 — 형식만 본다.
 */
describe('식별자 검증 계약 — 우리가 만든 ID 가 우리 API 를 통과한다', () => {
  const cases: Array<[string, string]> = [
    ['시드 상담원', SEEDED_AGENT_ID],
    ['시드 관리자', SEEDED_SUPERVISOR_ID],
    ['기본 테넌트', DEFAULT_TENANT_ID],
    ['새로 만든 상담원', GENERATED_AGENT_ID],
  ];

  it.each(cases)('큐 멤버 배정: %s', (_label, agentId) => {
    expect(errorsFor(SetQueueMembersDto, { members: [{ agentId }] })).toEqual([]);
  });

  it.each(cases)('권한 복사: %s', (_label, agentId) => {
    expect(errorsFor(CopyAgentPermissionsDto, {
      sourceAgentId: agentId,
      scopes: ['queueMembership'],
    })).toEqual([]);
  });

  it.each(cases)('공유 규칙 상담원: %s', (_label, agentId) => {
    expect(errorsFor(PutShareRuleAgentsDto, {
      agents: [{ agentId }],
      agentGroups: [],
    })).toEqual([]);
  });

  it('UUID 형식이 아니면 거부한다', () => {
    for (const bad of ['not-a-uuid', '', '00000000-0000-0000-0000-00000000020', 'zzzzzzzz-0000-0000-0000-000000000201']) {
      expect(errorsFor(SetQueueMembersDto, { members: [{ agentId: bad }] })).toContain('isUuidFormat');
    }
  });
});
