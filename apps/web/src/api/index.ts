// VITE_USE_MOCK=true 면 기존 mockApi, 아니면 realApi 를 사용한다.
// useCtiStore 는 여기서만 import 하면 되고, mock/real 전환은 런타임 env 로 결정.
import { USE_MOCK } from '../config';
import * as mock from './mockApi';
import * as real from './realApi';

const api = USE_MOCK ? mock : real;

export const getAgentSession = api.getAgentSession;
export const getQueuesSummary = api.getQueuesSummary;
export const getActiveCalls = api.getActiveCalls;
export const getCallHistory = api.getCallHistory;
export const getAgents = api.getAgents;
export const getAnnouncements = api.getAnnouncements;
export const updateAgentStatus = api.updateAgentStatus;
export const saveCallMemo = api.saveCallMemo;
export const transferCall = api.transferCall;
export const cancelAttendedTransferCall = api.cancelAttendedTransferCall;
export const completeAttendedTransferCall = api.completeAttendedTransferCall;
export const pickupCall = api.pickupCall;
export const muteCall = api.muteCall;
export const holdCall = api.holdCall;
export const hangupCall = api.hangupCall;
export const originateExternalCall = api.originateExternalCall;
export const originateInternalCall = api.originateInternalCall;

// 로그인/로그아웃은 real 쪽에만 구현. mock 모드에서는 no-op.
export const login = (real as any).login ?? (async () => undefined);
export const logout = (real as any).logout ?? (async () => undefined);
export const createDesktopHandoff = (real as any).createDesktopHandoff ?? (async () => undefined);
export const exchangeWebHandoff = (real as any).exchangeWebHandoff ?? (async () => undefined);
