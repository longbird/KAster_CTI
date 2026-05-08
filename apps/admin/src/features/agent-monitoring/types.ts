export interface AgentMonitorRow {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  role: string;
  isActive: boolean;
  agentGroup: { agentGroupId: string; groupCode: string; groupName: string } | null;
  loginStatus: 'LOGGED_IN' | 'LOGGED_OUT' | 'UNKNOWN';
  sipRegistration: {
    registered: boolean;
    registrationStatus: string;
    contactUri: string | null;
  };
  currentStatus: {
    statusCode: string;
    reasonCode: string | null;
    startedAt: string;
  } | null;
  activeCall: {
    callId: string;
    sessionStatus: string;
    direction: string | null;
    ani: string | null;
    dnis: string | null;
    queueName: string | null;
    answeredAt: string | null;
    talkSeconds: number | null;
  } | null;
}

export interface ActiveCallRow {
  callId: string;
  sessionStatus: string;
  direction: string | null;
  ani: string | null;
  dnis: string | null;
  queueName: string | null;
  answeredAt: string | null;
  talkSeconds: number | null;
  primaryAgentId: string | null;
}
