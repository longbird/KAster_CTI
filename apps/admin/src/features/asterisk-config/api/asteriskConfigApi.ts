import axios from 'axios';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../../../config';
import type { AgentSipRow, AsteriskDid, AsteriskIvrMenu, AsteriskTrunk, ConfPreview } from '../types/asterisk-config';

function headers(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const base = `${API_BASE_URL}/asterisk-config`;

export const getTrunks = () =>
  axios.get<{ data: AsteriskTrunk[] }>(`${base}/trunks`, { headers: headers() }).then(r => r.data.data);
export const createTrunk = (dto: Omit<AsteriskTrunk, 'id'>) =>
  axios.post<{ data: AsteriskTrunk }>(`${base}/trunks`, dto, { headers: headers() }).then(r => r.data.data);
export const updateTrunk = (id: string, dto: Omit<AsteriskTrunk, 'id'>) =>
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

export const manualReload = () =>
  axios.post(`${base}/reload`, {}, { headers: headers() });
export const getPreview = () =>
  axios.get<{ data: ConfPreview }>(`${base}/preview`, { headers: headers() }).then(r => r.data.data);
