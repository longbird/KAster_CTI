import { apiClient } from '../../../shared/lib/apiClient';

export interface ArsHttpEndpoint {
  endpointId: string;
  name: string;
  description: string | null;
  method: 'GET' | 'POST';
  url: string;
  requestMapping: Record<string, string>;
  authType: 'NONE' | 'BEARER' | 'HEADER';
  authHeaderName: string | null;
  resultPath: string;
  matchMode: 'EXISTS' | 'EQUALS' | 'IN';
  matchValue: string | null;
  timeoutMs: number;
  isActive: boolean;
  /** 자격증명이 등록돼 있는지. **값 자체는 서버가 절대 돌려주지 않는다.** */
  hasSecret: boolean;
}

export interface ArsHttpEndpointInput {
  name: string;
  description?: string | null;
  method: 'GET' | 'POST';
  url: string;
  requestMapping: Record<string, string>;
  authType: 'NONE' | 'BEARER' | 'HEADER';
  authHeaderName?: string | null;
  /** 생략하면 기존 자격증명을 그대로 둔다. */
  authSecret?: string;
  resultPath: string;
  matchMode: 'EXISTS' | 'EQUALS' | 'IN';
  matchValue?: string | null;
  timeoutMs: number;
  isActive: boolean;
}

export interface LookupOutcome {
  status: 'MATCH' | 'NOMATCH' | 'ERROR';
  value: string;
  reason?: string;
  httpStatus?: number;
  timeoutMs?: number;
  durationMs: number;
}

const BASE = '/admin/ars-http-endpoints';

export async function listArsHttpEndpoints(): Promise<ArsHttpEndpoint[]> {
  const { data } = await apiClient.get(BASE);
  return data?.data ?? data ?? [];
}

export async function createArsHttpEndpoint(input: ArsHttpEndpointInput): Promise<ArsHttpEndpoint> {
  const { data } = await apiClient.post(BASE, input);
  return data?.data ?? data;
}

export async function updateArsHttpEndpoint(
  endpointId: string,
  input: ArsHttpEndpointInput,
): Promise<ArsHttpEndpoint> {
  const { data } = await apiClient.patch(`${BASE}/${endpointId}`, input);
  return data?.data ?? data;
}

export async function deleteArsHttpEndpoint(endpointId: string): Promise<void> {
  await apiClient.delete(`${BASE}/${endpointId}`);
}

export async function testArsHttpEndpoint(
  endpointId: string,
  vars: { caller?: string; collected?: string; entryDid?: string },
): Promise<LookupOutcome> {
  const { data } = await apiClient.post(`${BASE}/${endpointId}/test`, vars);
  return data?.data ?? data;
}
