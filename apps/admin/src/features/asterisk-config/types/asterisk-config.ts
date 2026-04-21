export interface AsteriskTrunk {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  fromDomain: string;
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
  codecs?: string;
  enabled?: boolean;
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
  enabled: boolean;
  branchMappings?: Array<{
    branch: {
      branchId: string;
      branchCode: string;
      branchName: string;
    };
  }>;
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

export interface AsteriskBlocklistEntry {
  id: string;
  matchType: 'EXACT' | 'PREFIX';
  phoneNumber: string;
  description: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConfPreview {
  pjsip: string;
  extensionsInbound: string;
  extensionsQueue: string;
  extensionsAgent?: string;
  queues?: string;
}
