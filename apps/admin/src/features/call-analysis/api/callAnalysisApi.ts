import { apiClient } from '../../../shared/lib/apiClient';
import type { CallAnalysis, CallTranscriptResponse } from '../types/callAnalysis';

export async function getCallTranscript(callId: string) {
  const res = await apiClient.get(`/calls/${callId}/transcript`);
  return res.data?.data as CallTranscriptResponse;
}

export async function getCallAnalysis(callId: string) {
  const res = await apiClient.get(`/calls/${callId}/analysis`);
  return res.data?.data as CallAnalysis;
}

export async function retryCallAnalysis(callId: string) {
  const res = await apiClient.post(`/calls/${callId}/analysis/retry`);
  return res.data?.data as { accepted: boolean; recordingId: string };
}
