import axios from 'axios';
import { ACCESS_TOKEN_KEY, API_BASE_URL, USE_MOCK } from '../../../config';
import type { AgentSipRow, AsteriskBlocklistEntry, AsteriskBlocklistEntryInput, AsteriskBulkTrunkInput, AsteriskDid, AsteriskForwardingRule, AsteriskIvrMenu, AsteriskPrompt, AsteriskSpeedDial, AsteriskSpeedDialInput, AsteriskTrunk, AsteriskTrunkGroup, AsteriskTrunkGroupInput, AsteriskTrunkInput, ConfPreview, ImportBlocklistEntryRow, PromptGenerationJob, PromptTtsInput } from '../types/asterisk-config';

function headers(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const base = `${API_BASE_URL}/asterisk-config`;

const mockTrunks: AsteriskTrunk[] = [
  { id: 'mock-trunk-1', name: 'KT SIP Trunk', host: '203.0.113.10', port: 5060, username: 'cti-main', password: '********', fromDomain: 'pbx.example.local', displayNumber: '1234', computedDisplayNumber: '1234', codecs: 'ulaw,alaw', enabled: true },
  { id: 'mock-trunk-2', name: 'Backup Trunk', host: '203.0.113.20', port: 5060, username: '', password: '', fromDomain: '', displayNumber: null, computedDisplayNumber: null, codecs: 'ulaw', enabled: false },
];
const mockTrunkGroups: AsteriskTrunkGroup[] = [
  {
    id: 'mock-trunk-group-1',
    name: '대표 발신 그룹',
    description: '기본 발신 회선 풀',
    strategy: 'PRIORITY',
    isDefault: true,
    enabled: true,
    members: [
      { id: 'mock-member-1', trunkId: 'mock-trunk-1', priority: 100, enabled: true, trunk: mockTrunks[0] },
      { id: 'mock-member-2', trunkId: 'mock-trunk-2', priority: 200, enabled: true, trunk: mockTrunks[1] },
    ],
  },
];
const mockDids: AsteriskDid[] = [
  {
    id: 'mock-did-1',
    did: '07080148211',
    representativeNumber: '15990000',
    description: '대표 인입',
    ivrMenuId: 'mock-ivr-1',
    directQueue: null,
    directExtension: null,
    enabled: true,
    branchMappings: [{ branch: { branchId: 'mock-branch-1', branchCode: 'SEOUL-01', branchName: '서울 1지사' } }],
  },
  { id: 'mock-did-2', did: '07080148212', representativeNumber: '15990001', description: 'VIP 직통', ivrMenuId: null, directQueue: 'VIP', directExtension: null, enabled: true },
  { id: 'mock-did-3', did: '07080148213', representativeNumber: '15990002', description: '상담원 직통', ivrMenuId: null, directQueue: null, directExtension: '1001', enabled: true },
];
const mockSpeedDials: AsteriskSpeedDial[] = [
  { id: 'mock-speed-1', code: '*01', targetNumber: '01012345678', displayName: '긴급 연락처', description: null, enabled: true },
];
const mockIvrMenus: AsteriskIvrMenu[] = [
  {
    id: 'mock-ivr-1',
    name: '대표 ARS',
    welcomePrompt: 'welcome-main.wav',
    menuPrompt: 'menu-main.wav',
    timeoutSecs: 5,
    entries: [
      { id: 'mock-entry-1', digit: '1', label: '예약 상담', queueName: '예약' },
      { id: 'mock-entry-2', digit: '2', label: '일반 상담', queueName: '대표' },
    ],
  },
];
const mockAgentSip: AgentSipRow[] = [
  { agentId: 'agent-1001', agentName: '김지은', extension: '1001', sipPassword: '********', registrationStatus: 'Registered', contactUri: 'sip:1001@10.0.0.31', userAgent: 'KAster WebRTC', roundtripUsec: 26000 },
  { agentId: 'agent-1002', agentName: '박민수', extension: '1002', sipPassword: '********', registrationStatus: 'Unreachable', contactUri: null, userAgent: null, roundtripUsec: null },
];

export const getTrunks = () =>
  USE_MOCK ? Promise.resolve(mockTrunks) : axios.get<{ data: AsteriskTrunk[] }>(`${base}/trunks`, { headers: headers() }).then(r => r.data.data);
export const createTrunk = (dto: AsteriskTrunkInput) =>
  axios.post<{ data: AsteriskTrunk }>(`${base}/trunks`, dto, { headers: headers() }).then(r => r.data.data);
export const createTrunksBulk = (dto: AsteriskBulkTrunkInput) =>
  axios.post<{ data: AsteriskTrunk[] }>(`${base}/trunks/bulk`, dto, { headers: headers() }).then(r => r.data.data);
export const updateTrunk = (id: string, dto: AsteriskTrunkInput) =>
  axios.put<{ data: AsteriskTrunk }>(`${base}/trunks/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteTrunk = (id: string) =>
  axios.delete(`${base}/trunks/${id}`, { headers: headers() });

export const getTrunkGroups = () =>
  USE_MOCK ? Promise.resolve(mockTrunkGroups) : axios.get<{ data: AsteriskTrunkGroup[] }>(`${base}/trunk-groups`, { headers: headers() }).then(r => r.data.data);
export const createTrunkGroup = (dto: AsteriskTrunkGroupInput) =>
  axios.post<{ data: AsteriskTrunkGroup }>(`${base}/trunk-groups`, dto, { headers: headers() }).then(r => r.data.data);
export const updateTrunkGroup = (id: string, dto: AsteriskTrunkGroupInput) =>
  axios.put<{ data: AsteriskTrunkGroup }>(`${base}/trunk-groups/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteTrunkGroup = (id: string) =>
  axios.delete(`${base}/trunk-groups/${id}`, { headers: headers() });

export const getDids = () =>
  USE_MOCK ? Promise.resolve(mockDids) : axios.get<{ data: AsteriskDid[] }>(`${base}/dids`, { headers: headers() }).then(r => r.data.data);
export const createDid = (dto: Omit<AsteriskDid, 'id'>) =>
  axios.post<{ data: AsteriskDid }>(`${base}/dids`, dto, { headers: headers() }).then(r => r.data.data);
export const updateDid = (id: string, dto: Omit<AsteriskDid, 'id'>) =>
  axios.put<{ data: AsteriskDid }>(`${base}/dids/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteDid = (id: string) =>
  axios.delete(`${base}/dids/${id}`, { headers: headers() });

export const getSpeedDials = () =>
  USE_MOCK ? Promise.resolve(mockSpeedDials) : axios.get<{ data: AsteriskSpeedDial[] }>(`${base}/speed-dials`, { headers: headers() }).then(r => r.data.data);
export const createSpeedDial = (dto: AsteriskSpeedDialInput) =>
  axios.post<{ data: AsteriskSpeedDial }>(`${base}/speed-dials`, dto, { headers: headers() }).then(r => r.data.data);
export const updateSpeedDial = (id: string, dto: AsteriskSpeedDialInput) =>
  axios.put<{ data: AsteriskSpeedDial }>(`${base}/speed-dials/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteSpeedDial = (id: string) =>
  axios.delete(`${base}/speed-dials/${id}`, { headers: headers() });

export const getIvrMenus = () =>
  USE_MOCK ? Promise.resolve(mockIvrMenus) : axios.get<{ data: AsteriskIvrMenu[] }>(`${base}/ivr-menus`, { headers: headers() }).then(r => r.data.data);
export const createIvrMenu = (dto: Omit<AsteriskIvrMenu, 'id'>) =>
  axios.post<{ data: AsteriskIvrMenu }>(`${base}/ivr-menus`, dto, { headers: headers() }).then(r => r.data.data);
export const updateIvrMenu = (id: string, dto: Omit<AsteriskIvrMenu, 'id'>) =>
  axios.put<{ data: AsteriskIvrMenu }>(`${base}/ivr-menus/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteIvrMenu = (id: string) =>
  axios.delete(`${base}/ivr-menus/${id}`, { headers: headers() });

export const getAgentSip = () =>
  USE_MOCK ? Promise.resolve(mockAgentSip) : axios.get<{ data: AgentSipRow[] }>(`${base}/agents-sip`, { headers: headers() }).then(r => r.data.data);
export const updateAgentSipPassword = (agentId: string, sipPassword: string) =>
  axios.put(`${base}/agents-sip/${agentId}/password`, { sipPassword }, { headers: headers() });
export const syncAgentSip = () =>
  axios.post(`${base}/agents-sip/sync`, {}, { headers: headers() });

export const getForwardingRules = () =>
  axios.get<{ data: AsteriskForwardingRule[] }>(`${base}/forwarding-rules`, { headers: headers() }).then(r => r.data.data);
export const createForwardingRule = (dto: Omit<AsteriskForwardingRule, 'id' | 'did'>) =>
  axios.post<{ data: AsteriskForwardingRule }>(`${base}/forwarding-rules`, dto, { headers: headers() }).then(r => r.data.data);
export const updateForwardingRule = (id: string, dto: Omit<AsteriskForwardingRule, 'id' | 'did'>) =>
  axios.put<{ data: AsteriskForwardingRule }>(`${base}/forwarding-rules/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteForwardingRule = (id: string) =>
  axios.delete(`${base}/forwarding-rules/${id}`, { headers: headers() });

export const getPrompts = () =>
  axios.get<{ data: AsteriskPrompt[] }>(`${base}/prompts`, { headers: headers() }).then(r => r.data.data);
export const createPrompt = (dto: Omit<AsteriskPrompt, 'id'>) =>
  axios.post<{ data: AsteriskPrompt }>(`${base}/prompts`, dto, { headers: headers() }).then(r => r.data.data);
export const updatePrompt = (id: string, dto: Omit<AsteriskPrompt, 'id'>) =>
  axios.put<{ data: AsteriskPrompt }>(`${base}/prompts/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const uploadPromptAudio = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post<{ data: { fileName: string; promptKey: string; bytes: number } }>(
    `${base}/prompts/upload`,
    formData,
    {
      headers: {
        ...headers(),
        'Content-Type': 'multipart/form-data',
      },
    },
  ).then(r => r.data.data);
};
export const createPromptFromTts = (dto: PromptTtsInput) =>
  axios.post<{ data: { prompt: AsteriskPrompt; job: PromptGenerationJob } }>(
    `${base}/prompts/tts`,
    dto,
    { headers: headers() },
  ).then(r => r.data.data);
export const deletePrompt = (id: string) =>
  axios.delete(`${base}/prompts/${id}`, { headers: headers() });

export const getBlocklistEntries = () =>
  axios.get<{ data: AsteriskBlocklistEntry[] }>(`${base}/blocklist`, { headers: headers() }).then(r => r.data.data);
export const createBlocklistEntry = (dto: AsteriskBlocklistEntryInput) =>
  axios.post<{ data: AsteriskBlocklistEntry }>(`${base}/blocklist`, dto, { headers: headers() }).then(r => r.data.data);
export const importBlocklistEntries = (rows: ImportBlocklistEntryRow[]) =>
  axios.post<{ data: { summary: { successCount: number; skippedCount: number; failedCount: number }; failures: Array<{ rowNumber: number; reason: string }> } }>(
    `${base}/blocklist/import`,
    { rows },
    { headers: headers() },
  ).then(r => r.data.data);
export const updateBlocklistEntry = (id: string, dto: AsteriskBlocklistEntryInput) =>
  axios.put<{ data: AsteriskBlocklistEntry }>(`${base}/blocklist/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteBlocklistEntry = (id: string) =>
  axios.delete(`${base}/blocklist/${id}`, { headers: headers() });

export const manualReload = () =>
  axios.post(`${base}/reload`, {}, { headers: headers() });
export const getPreview = () =>
  axios.get<{ data: ConfPreview }>(`${base}/preview`, { headers: headers() }).then(r => r.data.data);
