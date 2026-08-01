import {
  DEFAULT_OUTBOUND_DIAL_PERMISSIONS,
  normalizeOutboundDialPermissions,
  OutboundDialPermissions,
} from '../../../common/outbound-dial-policy.util';

export interface AgentRuntimeProfile {
  inoutType: 'IN_OUTBOUND' | 'INBOUND_ONLY' | 'OUTBOUND_ONLY';
  answerMode: 'MANUAL' | 'AUTO';
  numberMasking: 'NOT_USE' | 'USE';
  pickupType: 'STRONG' | 'NORMAL' | 'NOT_USE';
  forcedPickupMode: 'AUTO_REQUEST' | 'MANUAL';
  rejectInbound: 'USE' | 'NOT_USE';
  outboundAccessFixed: 'NOT_USE' | 'USE';
  adminPermission: 'NOT_USE' | 'USE';
  agentType: 'BASIC' | 'SENIOR' | 'MANAGER';
  liveRecording: 'USE' | 'NOT_USE';
  cidServer: 'BASIC' | 'EXTERNAL';
  closeStatusPermission: 'COUNSEL_ONLY' | 'SUPERVISOR' | 'ALL';
  autoChangeToAcw: boolean;
  acwToReadyDelay: 'NOT_USE' | '30' | '60' | '120';
  popupCloseToReady: 'NOT_USE' | 'IMMEDIATE';
  outboundDialPermissions: OutboundDialPermissions;
  description: string;
}

export const DEFAULT_AGENT_RUNTIME_PROFILE: AgentRuntimeProfile = {
  description: '',
  inoutType: 'IN_OUTBOUND',
  answerMode: 'MANUAL',
  numberMasking: 'NOT_USE',
  pickupType: 'STRONG',
  forcedPickupMode: 'AUTO_REQUEST',
  rejectInbound: 'USE',
  outboundAccessFixed: 'NOT_USE',
  adminPermission: 'NOT_USE',
  agentType: 'BASIC',
  liveRecording: 'USE',
  cidServer: 'BASIC',
  closeStatusPermission: 'COUNSEL_ONLY',
  autoChangeToAcw: false,
  acwToReadyDelay: 'NOT_USE',
  popupCloseToReady: 'NOT_USE',
  outboundDialPermissions: { ...DEFAULT_OUTBOUND_DIAL_PERMISSIONS },
};

export function normalizeAgentRuntimeProfile(input: unknown): AgentRuntimeProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_AGENT_RUNTIME_PROFILE };
  }

  const source = input as Partial<AgentRuntimeProfile>;
  return {
    ...DEFAULT_AGENT_RUNTIME_PROFILE,
    ...source,
    outboundDialPermissions: normalizeOutboundDialPermissions(source.outboundDialPermissions),
  };
}

export function buildPickupGroupName(defaultQueueId: string | null | undefined): string {
  return defaultQueueId ? `queue-${defaultQueueId}` : 'all-agents';
}
