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

export interface AsteriskDid {
  id: string;
  did: string;
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
}

export interface ConfPreview {
  pjsip: string;
  extensionsInbound: string;
  extensionsQueue: string;
}
