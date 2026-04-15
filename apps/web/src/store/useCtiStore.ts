import { create } from 'zustand';
import {
  getActiveCalls,
  getAgentSession,
  getCallHistory,
  getQueuesSummary,
  hangupCall,
  saveCallMemo,
  transferCall,
  updateAgentStatus,
} from '../api';
import { connectSocket } from '../ws';
import type { ActiveCall, AgentSession, CallHistoryItem, CtiEvent, QueueSummary } from '../types/cti';

interface CtiState {
  loading: boolean;
  agentSession: AgentSession | null;
  queues: QueueSummary[];
  activeCalls: ActiveCall[];
  selectedCallId: string | null;
  recentHistory: CallHistoryItem[];
  notifications: string[];
  init: () => Promise<void>;
  selectCall: (callId: string) => void;
  changeStatus: (statusCode: AgentSession['statusCode']) => Promise<void>;
  saveMemo: (memo: string, resultCode: string) => Promise<void>;
  transfer: (target: string) => Promise<void>;
  hangup: () => Promise<void>;
  applyEvent: (event: CtiEvent) => void;
}

let disconnectSocket: (() => void) | null = null;

export const useCtiStore = create<CtiState>((set, get) => ({
  loading: true,
  agentSession: null,
  queues: [],
  activeCalls: [],
  selectedCallId: null,
  recentHistory: [],
  notifications: [],
  init: async () => {
    set({ loading: true });

    const [agentRes, queueRes, activeRes, historyRes] = await Promise.all([
      getAgentSession(),
      getQueuesSummary(),
      getActiveCalls(),
      getCallHistory(),
    ]);

    set({
      loading: false,
      agentSession: agentRes.data,
      queues: queueRes.data,
      activeCalls: activeRes.data,
      selectedCallId: activeRes.data[0]?.callId ?? null,
      recentHistory: historyRes.data,
    });

    disconnectSocket?.();
    disconnectSocket = connectSocket(get().applyEvent);
  },
  selectCall: (callId) => set({ selectedCallId: callId }),
  changeStatus: async (statusCode) => {
    const response = await updateAgentStatus(statusCode);
    set((state) => ({
      agentSession: state.agentSession ? { ...state.agentSession, statusCode: response.data.statusCode } : null,
      notifications: [`상담원 상태가 ${response.data.statusCode} 로 변경되었습니다.`, ...state.notifications].slice(0, 5),
    }));
  },
  saveMemo: async (memo, resultCode) => {
    const callId = get().selectedCallId;
    if (!callId) return;

    await saveCallMemo(callId, memo, resultCode);
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId ? { ...call, memo, resultCode } : call,
      ),
      notifications: [`상담 메모가 저장되었습니다. (${resultCode})`, ...state.notifications].slice(0, 5),
    }));
  },
  transfer: async (target) => {
    const callId = get().selectedCallId;
    if (!callId) return;

    await transferCall(callId, target);
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId ? { ...call, sessionStatus: 'TRANSFERRING' } : call,
      ),
      notifications: [`호 전환 요청이 접수되었습니다. 대상: ${target}`, ...state.notifications].slice(0, 5),
    }));
  },
  hangup: async () => {
    const callId = get().selectedCallId;
    if (!callId) return;

    await hangupCall(callId);
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId ? { ...call, sessionStatus: 'ENDED' } : call,
      ),
      notifications: ['통화 종료 요청이 처리되었습니다.', ...state.notifications].slice(0, 5),
    }));
  },
  applyEvent: (event) => {
    switch (event.type) {
      case 'call.created':
        set((state) => ({ activeCalls: [event.payload, ...state.activeCalls], selectedCallId: event.payload.callId }));
        break;
      case 'call.updated':
        set((state) => ({
          activeCalls: state.activeCalls.map((call) =>
            call.callId === event.payload.callId ? { ...call, ...event.payload } : call,
          ),
          notifications: [`콜 상태가 ${event.payload.sessionStatus} 로 변경되었습니다.`, ...state.notifications].slice(0, 5),
        }));
        break;
      case 'call.ended':
        set((state) => ({
          activeCalls: state.activeCalls.map((call) =>
            call.callId === event.payload.callId ? { ...call, sessionStatus: 'ENDED' } : call,
          ),
          notifications: [`통화 종료 이벤트 수신 (${event.payload.talkSeconds}초)`, ...state.notifications].slice(0, 5),
        }));
        break;
      case 'screenpop.customer':
        set((state) => ({
          activeCalls: state.activeCalls.map((call) =>
            call.callId === event.payload.callId ? { ...call, customer: event.payload.customer } : call,
          ),
          notifications: [`고객 팝업: ${event.payload.customer.customerName}`, ...state.notifications].slice(0, 5),
        }));
        break;
      case 'agent.status.changed':
        set((state) => ({
          agentSession: state.agentSession
            ? { ...state.agentSession, statusCode: event.payload.statusCode }
            : null,
        }));
        break;
      case 'queue.summary.updated':
        set({ queues: event.payload });
        break;
      default:
        break;
    }
  },
}));
