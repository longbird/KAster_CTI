export interface AgentSettingsProfile {
  description: string;
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
  outboundDialPermissions: {
    phoneDirect: boolean;
    domestic: boolean;
    representative: boolean;
    paid: boolean;
    international: boolean;
  };
}

export const DEFAULT_AGENT_SETTINGS_PROFILE: AgentSettingsProfile = {
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
  outboundDialPermissions: {
    phoneDirect: false,
    domestic: true,
    representative: true,
    paid: false,
    international: false,
  },
};

// Deferred in the current product version. Values remain in the stored profile
// for forward compatibility, but the admin UI does not expose them for now.
export const DEFERRED_AGENT_SETTINGS_FIELDS = [
  'answerMode',
  'rejectInbound',
  'forcedPickupMode',
  'cidServer',
] as const;

export const INOUT_TYPE_OPTIONS = [
  { value: 'IN_OUTBOUND', label: '인/아웃바운드' },
  { value: 'INBOUND_ONLY', label: '인바운드 전용' },
  { value: 'OUTBOUND_ONLY', label: '아웃바운드 전용' },
];

export const ANSWER_MODE_OPTIONS = [
  { value: 'MANUAL', label: '수동응답' },
  { value: 'AUTO', label: '자동응답' },
];

export const SIMPLE_USE_OPTIONS = [
  { value: 'USE', label: '사용' },
  { value: 'NOT_USE', label: '미사용' },
];

export const NUMBER_MASKING_OPTIONS = [
  { value: 'NOT_USE', label: '미사용' },
  { value: 'USE', label: '사용' },
];

export const PICKUP_TYPE_OPTIONS = [
  { value: 'STRONG', label: '강제 당겨받기' },
  { value: 'NORMAL', label: '일반 당겨받기' },
  { value: 'NOT_USE', label: '미사용' },
];

export const FORCED_PICKUP_MODE_OPTIONS = [
  { value: 'AUTO_REQUEST', label: '자동응답요청' },
  { value: 'MANUAL', label: '수동' },
];

export const AGENT_TYPE_OPTIONS = [
  { value: 'BASIC', label: '기본' },
  { value: 'SENIOR', label: '숙련' },
  { value: 'MANAGER', label: '관리형' },
];

export const CLOSE_STATUS_PERMISSION_OPTIONS = [
  { value: 'COUNSEL_ONLY', label: '상담원만' },
  { value: 'SUPERVISOR', label: '슈퍼바이저 포함' },
  { value: 'ALL', label: '전체 허용' },
];

export const READY_DELAY_OPTIONS = [
  { value: 'NOT_USE', label: '사용안함' },
  { value: '30', label: '30초' },
  { value: '60', label: '60초' },
  { value: '120', label: '120초' },
];

export const POPUP_CLOSE_READY_OPTIONS = [
  { value: 'NOT_USE', label: '사용안함' },
  { value: 'IMMEDIATE', label: '접수창 닫힘 즉시' },
];

export function normalizeAgentSettingsProfile(input: any): AgentSettingsProfile {
  const source = input && typeof input === 'object' ? input : {};
  const permissions = source.outboundDialPermissions && typeof source.outboundDialPermissions === 'object'
    ? source.outboundDialPermissions
    : {};

  return {
    ...DEFAULT_AGENT_SETTINGS_PROFILE,
    ...source,
    outboundDialPermissions: {
      ...DEFAULT_AGENT_SETTINGS_PROFILE.outboundDialPermissions,
      ...permissions,
    },
  };
}
