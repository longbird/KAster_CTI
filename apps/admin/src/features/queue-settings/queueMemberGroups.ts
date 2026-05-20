export const ALL_GROUPS_VALUE = 'ALL';
export const NO_GROUP_VALUE = 'NO_GROUP';

export interface AgentGroupRef {
  agentGroupId: string;
  groupCode: string;
  groupName: string;
}

export interface QueueMemberAgent {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  defaultQueueId?: string | null;
  agentGroupId?: string | null;
  agentGroup?: AgentGroupRef | null;
  isActive?: boolean;
}

export interface DraftQueueMember extends QueueMemberAgent {
  penalty: number;
  memberOrder: number;
}

export function getAgentGroupLabel(agent: Pick<QueueMemberAgent, 'agentGroup'>) {
  return agent.agentGroup?.groupName ?? '미지정';
}

export function filterAgentsByGroup<T extends QueueMemberAgent>(agents: T[], groupFilter: string): T[] {
  if (groupFilter === ALL_GROUPS_VALUE) return agents;
  if (groupFilter === NO_GROUP_VALUE) {
    return agents.filter((agent) => !agent.agentGroupId);
  }
  return agents.filter((agent) => agent.agentGroupId === groupFilter);
}

export function filterAvailableAgents<T extends QueueMemberAgent>(
  agents: T[],
  assignedIdSet: Set<string>,
  groupFilter: string,
  searchText: string,
): T[] {
  const keyword = searchText.trim().toLowerCase();
  return filterAgentsByGroup(agents, groupFilter).filter((agent) => {
    if (assignedIdSet.has(agent.agentId)) return false;
    if (!keyword) return true;
    return [agent.agentName, agent.loginId, agent.extension, getAgentGroupLabel(agent)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });
}

export function toDraftMember(agent: QueueMemberAgent, memberOrder: number): DraftQueueMember {
  return {
    agentId: agent.agentId,
    agentName: agent.agentName,
    loginId: agent.loginId,
    extension: agent.extension,
    defaultQueueId: agent.defaultQueueId ?? null,
    agentGroupId: agent.agentGroupId ?? null,
    agentGroup: agent.agentGroup ?? null,
    penalty: 0,
    memberOrder,
  };
}

export function appendGroupMembers<T extends DraftQueueMember>(
  currentMembers: T[],
  allAgents: QueueMemberAgent[],
  groupFilter: string,
): Array<T | DraftQueueMember> {
  if (groupFilter === ALL_GROUPS_VALUE) return currentMembers;
  const assignedIdSet = new Set(currentMembers.map((member) => member.agentId));
  const additions = filterAgentsByGroup(allAgents, groupFilter)
    .filter((agent) => !assignedIdSet.has(agent.agentId))
    .map((agent, index) => toDraftMember(agent, currentMembers.length + index));
  return [...currentMembers, ...additions];
}
