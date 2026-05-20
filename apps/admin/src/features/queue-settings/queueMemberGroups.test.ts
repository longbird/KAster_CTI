import { describe, expect, it } from 'vitest';
import { appendGroupMembers, filterAgentsByGroup, getAgentGroupLabel } from './queueMemberGroups';

const agents = [
  {
    agentId: 'agent-1',
    agentName: '김상담',
    loginId: 'agent1',
    extension: '1001',
    agentGroupId: 'group-sales',
    agentGroup: { agentGroupId: 'group-sales', groupCode: 'SALES', groupName: '영업팀' },
    isActive: true,
  },
  {
    agentId: 'agent-2',
    agentName: '이상담',
    loginId: 'agent2',
    extension: '1002',
    agentGroupId: 'group-support',
    agentGroup: { agentGroupId: 'group-support', groupCode: 'SUPPORT', groupName: '지원팀' },
    isActive: true,
  },
  {
    agentId: 'agent-3',
    agentName: '박상담',
    loginId: 'agent3',
    extension: '1003',
    agentGroupId: null,
    agentGroup: null,
    isActive: true,
  },
];

describe('queueMemberGroups', () => {
  it('상담원의 실제 상담원 그룹명을 표시한다', () => {
    expect(getAgentGroupLabel(agents[0])).toBe('영업팀');
    expect(getAgentGroupLabel(agents[2])).toBe('미지정');
  });

  it('그룹 필터는 agentGroupId 기준으로 상담원을 좁힌다', () => {
    expect(filterAgentsByGroup(agents, 'group-sales').map((agent) => agent.agentId)).toEqual(['agent-1']);
    expect(filterAgentsByGroup(agents, 'NO_GROUP').map((agent) => agent.agentId)).toEqual(['agent-3']);
    expect(filterAgentsByGroup(agents, 'ALL')).toHaveLength(3);
  });

  it('그룹 추가는 선택 그룹의 미배정 상담원만 순서대로 추가한다', () => {
    const result = appendGroupMembers(
      [{ agentId: 'agent-1', agentName: '김상담', loginId: 'agent1', extension: '1001', memberOrder: 0, penalty: 0 }],
      agents,
      'group-sales',
    );

    expect(result).toEqual([
      { agentId: 'agent-1', agentName: '김상담', loginId: 'agent1', extension: '1001', memberOrder: 0, penalty: 0 },
    ]);

    const supportResult = appendGroupMembers(result, agents, 'group-support');
    expect(supportResult).toEqual([
      { agentId: 'agent-1', agentName: '김상담', loginId: 'agent1', extension: '1001', memberOrder: 0, penalty: 0 },
      {
        agentId: 'agent-2',
        agentName: '이상담',
        loginId: 'agent2',
        extension: '1002',
        agentGroupId: 'group-support',
        agentGroup: { agentGroupId: 'group-support', groupCode: 'SUPPORT', groupName: '지원팀' },
        defaultQueueId: null,
        memberOrder: 1,
        penalty: 0,
      },
    ]);
  });
});
