import { apiClient } from '../../../shared/lib/apiClient';
import type { GraphPayload } from '../types/canvasGraph';
import type { ArsFlow, FlowGraphResponse, FlowValidationResult } from '../types/flowGraph';

const base = '/admin/ars-flows';

export async function listArsFlows() {
  const res = await apiClient.get(base);
  return (res.data?.data ?? []) as ArsFlow[];
}

export async function getArsFlow(flowId: string) {
  const res = await apiClient.get(`${base}/${flowId}`);
  return res.data?.data as FlowGraphResponse;
}

export async function createArsFlow(input: { name: string; description?: string }) {
  const res = await apiClient.post(base, input);
  return res.data?.data as ArsFlow;
}

export async function deleteArsFlow(flowId: string) {
  const res = await apiClient.delete(`${base}/${flowId}`);
  return res.data?.data as { deleted: boolean };
}

/** 저장하지 않고 검증만. 서버 판정이 최종이다. */
export async function validateArsFlow(flowId: string, payload: GraphPayload) {
  const res = await apiClient.post(`${base}/${flowId}/validate`, payload);
  return res.data?.data as FlowValidationResult;
}

export async function saveArsFlowGraph(flowId: string, payload: GraphPayload) {
  const res = await apiClient.patch(`${base}/${flowId}/graph`, payload);
  return res.data?.data as { saved: boolean; warnings: FlowValidationResult['warnings'] };
}

/** 컴파일된 dialplan 을 그대로 돌려준다. 무엇이 나가는지 숨기지 않는다. */
export async function previewArsFlow(flowId: string, did: string) {
  const res = await apiClient.get(`${base}/${flowId}/preview`, { params: { did } });
  return res.data?.data as { conf: string; warnings: FlowValidationResult['warnings'] };
}
