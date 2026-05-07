import type { AgentStatusCode } from '../../../shared/cti';
import type { DesktopAgentDirectoryItem } from '../../../shared/ipc';

const REST_STATUSES = new Set<AgentStatusCode>(['BREAK', 'MEAL', 'TRAINING', 'MANUAL_PAUSED']);
const WORK_STATUSES = new Set<AgentStatusCode>(['AFTER_CALL_WORK', 'TALKING', 'HOLD', 'TRANSFERRING']);

export function getAgentCallBlockReason(agent: DesktopAgentDirectoryItem) {
  if (!agent.isActive) return '로그아웃';
  if (agent.loginStatus !== 'LOGGED_IN') return '로그아웃';
  if (!agent.sipRegistration?.registered) return '전화기 미등록';
  return null;
}

export function formatDirectoryAgentAvailability(agent: DesktopAgentDirectoryItem) {
  const blockReason = getAgentCallBlockReason(agent);
  if (blockReason) {
    return blockReason;
  }

  const status = agent.currentStatus?.statusCode ?? null;
  if (!status || status === 'AVAILABLE') {
    return '상담 가능';
  }
  if (REST_STATUSES.has(status)) {
    return '휴식';
  }
  if (WORK_STATUSES.has(status)) {
    return '업무처리';
  }
  return '업무처리';
}

export function formatDirectoryAgentSummary(agent: DesktopAgentDirectoryItem) {
  return `${agent.extension} / ${formatDirectoryAgentAvailability(agent)}`;
}
