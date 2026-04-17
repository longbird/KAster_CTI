import axios from 'axios';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../../../config';
import type { AgentSipRow, AsteriskBlocklistEntry, AsteriskBulkTrunkInput, AsteriskDid, AsteriskForwardingRule, AsteriskIvrMenu, AsteriskPrompt, AsteriskTrunk, AsteriskTrunkInput, ConfPreview } from '../types/asterisk-config';

function headers(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const base = `${API_BASE_URL}/asterisk-config`;

export const getTrunks = () =>
  axios.get<{ data: AsteriskTrunk[] }>(`${base}/trunks`, { headers: headers() }).then(r => r.data.data);
export const createTrunk = (dto: AsteriskTrunkInput) =>
  axios.post<{ data: AsteriskTrunk }>(`${base}/trunks`, dto, { headers: headers() }).then(r => r.data.data);
export const createTrunksBulk = (dto: AsteriskBulkTrunkInput) =>
  axios.post<{ data: AsteriskTrunk[] }>(`${base}/trunks/bulk`, dto, { headers: headers() }).then(r => r.data.data);
export const updateTrunk = (id: string, dto: AsteriskTrunkInput) =>
  axios.put<{ data: AsteriskTrunk }>(`${base}/trunks/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteTrunk = (id: string) =>
  axios.delete(`${base}/trunks/${id}`, { headers: headers() });

export const getDids = () =>
  axios.get<{ data: AsteriskDid[] }>(`${base}/dids`, { headers: headers() }).then(r => r.data.data);
export const createDid = (dto: Omit<AsteriskDid, 'id'>) =>
  axios.post<{ data: AsteriskDid }>(`${base}/dids`, dto, { headers: headers() }).then(r => r.data.data);
export const updateDid = (id: string, dto: Omit<AsteriskDid, 'id'>) =>
  axios.put<{ data: AsteriskDid }>(`${base}/dids/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteDid = (id: string) =>
  axios.delete(`${base}/dids/${id}`, { headers: headers() });

export const getIvrMenus = () =>
  axios.get<{ data: AsteriskIvrMenu[] }>(`${base}/ivr-menus`, { headers: headers() }).then(r => r.data.data);
export const createIvrMenu = (dto: Omit<AsteriskIvrMenu, 'id'>) =>
  axios.post<{ data: AsteriskIvrMenu }>(`${base}/ivr-menus`, dto, { headers: headers() }).then(r => r.data.data);
export const updateIvrMenu = (id: string, dto: Omit<AsteriskIvrMenu, 'id'>) =>
  axios.put<{ data: AsteriskIvrMenu }>(`${base}/ivr-menus/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteIvrMenu = (id: string) =>
  axios.delete(`${base}/ivr-menus/${id}`, { headers: headers() });

export const getAgentSip = () =>
  axios.get<{ data: AgentSipRow[] }>(`${base}/agents-sip`, { headers: headers() }).then(r => r.data.data);
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
export const deletePrompt = (id: string) =>
  axios.delete(`${base}/prompts/${id}`, { headers: headers() });

export const getBlocklistEntries = () =>
  axios.get<{ data: AsteriskBlocklistEntry[] }>(`${base}/blocklist`, { headers: headers() }).then(r => r.data.data);
export const createBlocklistEntry = (dto: Omit<AsteriskBlocklistEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
  axios.post<{ data: AsteriskBlocklistEntry }>(`${base}/blocklist`, dto, { headers: headers() }).then(r => r.data.data);
export const updateBlocklistEntry = (id: string, dto: Omit<AsteriskBlocklistEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
  axios.put<{ data: AsteriskBlocklistEntry }>(`${base}/blocklist/${id}`, dto, { headers: headers() }).then(r => r.data.data);
export const deleteBlocklistEntry = (id: string) =>
  axios.delete(`${base}/blocklist/${id}`, { headers: headers() });

export const manualReload = () =>
  axios.post(`${base}/reload`, {}, { headers: headers() });
export const getPreview = () =>
  axios.get<{ data: ConfPreview }>(`${base}/preview`, { headers: headers() }).then(r => r.data.data);
