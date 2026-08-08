export interface AsteriskTrunk {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  fromDomain: string;
  displayNumber: string | null;
  computedDisplayNumber: string | null;
  codecs: string;
  enabled: boolean;
}

export interface AsteriskTrunkInput {
  name: string;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  fromDomain?: string;
  displayNumber?: string | null;
  codecs?: string;
  enabled?: boolean;
}

export interface AsteriskTrunkGroupMember {
  id: string;
  trunkId: string;
  priority: number;
  enabled: boolean;
  trunk: AsteriskTrunk;
}

export interface AsteriskTrunkGroup {
  id: string;
  name: string;
  description: string | null;
  strategy: 'PRIORITY';
  isDefault: boolean;
  enabled: boolean;
  members: AsteriskTrunkGroupMember[];
}

export interface AsteriskTrunkGroupInput {
  name: string;
  description?: string | null;
  strategy?: 'PRIORITY';
  isDefault?: boolean;
  enabled?: boolean;
  members: Array<{
    trunkId: string;
    priority?: number;
    enabled?: boolean;
  }>;
}

export interface AsteriskBulkTrunkEntryInput {
  name?: string;
  host?: string;
  port?: number;
}

export interface AsteriskBulkTrunkInput {
  namePrefix?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  fromDomain?: string;
  displayNumber?: string | null;
  codecs?: string;
  enabled?: boolean;
  entries: AsteriskBulkTrunkEntryInput[];
}

export interface AsteriskDid {
  id: string;
  did: string;
  representativeNumber: string | null;
  description: string | null;
  ivrMenuId: string | null;
  directQueue: string | null;
  directExtension: string | null;
  enabled: boolean;
  branchMappings?: Array<{
    branch: {
      branchId: string;
      branchCode: string;
      branchName: string;
    };
  }>;
}

export interface AsteriskSpeedDial {
  id: string;
  code: string;
  targetNumber: string;
  displayName: string | null;
  description: string | null;
  enabled: boolean;
}

export interface AsteriskSpeedDialInput {
  code: string;
  targetNumber: string;
  displayName?: string | null;
  description?: string | null;
  enabled?: boolean;
}

export interface DistributionRuleOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
  isDefaultRule?: boolean;
}

export interface AsteriskIvrEntry {
  id?: string;
  digit: string;
  label: string;
  queueName: string;
}

export interface AsteriskIvrMenu {
  id: string;
  name: string;
  welcomePrompt: string | null;
  menuPrompt: string | null;
  timeoutSecs: number;
  entries: AsteriskIvrEntry[];
}

export interface AgentSipRow {
  agentId: string;
  agentName: string;
  extension: string;
  sipPassword: string | null;
  effectiveSipPassword?: string | null;
  usesSiteDefault?: boolean;
  registrationStatus?: string | null;
  contactUri?: string | null;
  userAgent?: string | null;
  roundtripUsec?: number | null;
}

export interface AsteriskForwardingRule {
  id: string;
  didId: string;
  forwardType: 'EXTENSION' | 'QUEUE' | 'EXTERNAL_NUMBER';
  targetValue: string;
  forwardTriggerMode: 'IMMEDIATE' | 'AFTER_QUEUE_WAIT' | 'SMART_NO_READY';
  queueWaitSeconds: number | null;
  stickyCallbackWindowMinutes: number | null;
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string[];
  schedules: Array<{
    conditionType: 'ALWAYS' | 'TIME_RANGE';
    timeStart: string | null;
    timeEnd: string | null;
    daysOfWeek: string[];
  }>;
  description: string | null;
  enabled: boolean;
  did: {
    id: string;
    did: string;
    description: string | null;
  };
}

export interface AsteriskPrompt {
  id: string;
  promptKey: string;
  displayName: string;
  fileName: string;
  category: string;
  description: string | null;
  isActive: boolean;
}

export interface PromptGenerationJob {
  promptGenerationJobId: string;
  promptId: string | null;
  promptKey: string;
  displayName: string;
  fileName: string;
  sourceText: string;
  provider: string;
  voice: string | null;
  language: string;
  format: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  errorMessage: string | null;
  generatedBytes: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PromptTtsInput {
  text: string;
  displayName: string;
  promptKey?: string;
  category?: string;
  description?: string | null;
  voice?: string;
  language?: string;
  isActive?: boolean;
}

export interface AsteriskBlocklistEntry {
  id: string;
  matchType: 'EXACT' | 'PREFIX';
  phoneNumber: string;
  normalizedPhoneNumber?: string | null;
  requesterPhoneNumber?: string | null;
  normalizedRequesterPhone?: string | null;
  sourceType?: string | null;
  branchId?: string | null;
  entryDid?: string | null;
  description: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AsteriskBlocklistEntryInput {
  matchType?: 'EXACT' | 'PREFIX';
  phoneNumber: string;
  description?: string | null;
  branchId?: string | null;
  isActive?: boolean;
}

export interface ImportBlocklistEntryRow {
  전화번호: string;
  사유?: string;
}

export interface ConfPreview {
  pjsip: string;
  extensionsInbound: string;
  extensionsQueue: string;
  extensionsAgent?: string;
  queues?: string;
}

/** 기능코드는 고정 카탈로그다. 서버가 카탈로그 메타와 저장값을 합쳐 내려준다. */
export interface FeatureCode {
  featureKey: string;
  label: string;
  description: string;
  /** HANDSET_DIAL 만 단말에서 눌러 쓸 수 있다. SERVER_DTMF 는 서버가 PBX 로 보낸다. */
  invocation: 'HANDSET_DIAL' | 'SERVER_DTMF';
  optional: boolean;
  defaultCode: string | null;
  code: string | null;
  enabled: boolean;
  /** 아직 저장된 적 없이 기본값으로 보이는 중인가 */
  configured: boolean;
}

export interface FeatureCodeInput {
  featureKey: string;
  code?: string | null;
  enabled?: boolean;
}
