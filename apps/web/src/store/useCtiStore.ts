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
import type {
  ActiveCall,
  AgentSession,
  CallHistoryItem,
  CtiEvent,
  EventLogItem,
  QueueSummary,
} from '../types/cti';

interface CtiState {
  loading: boolean;
  agentSession: AgentSession | null;
  queues: QueueSummary[];
  activeCalls: ActiveCall[];
  selectedCallId: string | null;
  recentHistory: CallHistoryItem[];
  notifications: string[];
  eventLog: EventLogItem[];
  init: () => Promise<void>;
  selectCall: (callId: string) => void;
  changeStatus: (statusCode: AgentSession['statusCode']) => Promise<void>;
  saveMemo: (memo: string, resultCode: string) => Promise<void>;
  transfer: (target: string) => Promise<void>;
  hangup: () => Promise<void>;
  applyEvent: (event: CtiEvent) => void;
}

let disconnectSocket: (() => void) | null = null;

function toHistoryItem(call: ActiveCall): CallHistoryItem {
  return {
    callId: call.callId,
    customerName: call.customer?.customerName ?? '미식별 고객',
    phoneNumber: call.ani ?? call.dnis ?? '-',
    resultCode: call.resultCode ?? 'COMPLETED',
    startedAt: call.startedAt,
    talkSeconds: call.answeredAt
      ? Math.max(0, Math.floor((Date.now() - new Date(call.answeredAt).getTime()) / 1000))
      : 0,
    queueName: call.queueName ?? '-',
  };
}

// 메시지 기반 로그 + 간단한 string notifications 둘 다 유지한다.
// EventLogPanel 은 풍부한 EventLogItem 을, BottomPanels 은 한 줄 알림을 보여준다.
function pushLog(
  state: CtiState,
  type: EventLogItem['type'],
  message: string,
): EventLogItem[] {
  const entry: EventLogItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    message,
  };
  return [entry, ...state.eventLog].slice(0, 50);
}

export const useCtiStore = create<CtiState>((set, get) => ({
  loading: true,
  agentSession: null,
  queues: [],
  activeCalls: [],
  selectedCallId: null,
  recentHistory: [],
  notifications: [],
  eventLog: [],
  init: async () => {
    set({ loading: true });

    // 401 로 인한 auth clear (apiClient interceptor) 이 일어날 수 있으므로
    // 각각을 안전하게 감싸 throw 하지 않게 한다. 실패한 조각은 빈 값으로 대체되고,
    // RequireAuth 가 isAuthenticated=false 로 바뀌면 자동으로 LoginPage 로 복귀.
    const safe = async <T>(p: Promise<{ data: T }>, fallback: T) => {
      try {
        const res = await p;
        return res.data;
      } catch {
        return fallback;
      }
    };

    const [agentSession, queues, activeCalls, recentHistory] = await Promise.all([
      safe(getAgentSession(), null as any),
      safe(getQueuesSummary(), [] as any),
      safe(getActiveCalls(), [] as any),
      safe(getCallHistory(), [] as any),
    ]);

    set({
      loading: false,
      agentSession,
      queues,
      activeCalls,
      selectedCallId: activeCalls[0]?.callId ?? null,
      recentHistory,
    });

    disconnectSocket?.();
    disconnectSocket = connectSocket(get().applyEvent);
  },
  selectCall: (callId) => set({ selectedCallId: callId }),
  changeStatus: async (statusCode) => {
    const response = await updateAgentStatus(statusCode);
    const msg = `상담원 상태가 ${response.data.statusCode} 로 변경되었습니다.`;
    set((state) => ({
      agentSession: state.agentSession
        ? { ...state.agentSession, statusCode: response.data.statusCode }
        : null,
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'agent.status.changed', msg),
    }));
  },
  saveMemo: async (memo, resultCode) => {
    const callId = get().selectedCallId;
    if (!callId) return;

    await saveCallMemo(callId, memo, resultCode);
    const msg = `상담 메모가 저장되었습니다. (${resultCode})`;
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId ? { ...call, memo, resultCode } : call,
      ),
      recentHistory: state.recentHistory.map((item) =>
        item.callId === callId ? { ...item, resultCode } : item,
      ),
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  transfer: async (target) => {
    const callId = get().selectedCallId;
    if (!callId) return;

    await transferCall(callId, target);
    const msg = `호 전환 요청이 접수되었습니다. 대상: ${target}`;
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId ? { ...call, sessionStatus: 'TRANSFERRING' } : call,
      ),
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  hangup: async () => {
    const callId = get().selectedCallId;
    if (!callId) return;

    await hangupCall(callId);
    const msg = '통화 종료 요청이 처리되었습니다.';
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId ? { ...call, sessionStatus: 'ENDED' } : call,
      ),
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'call.ended', msg),
    }));
  },
  applyEvent: (event) => {
    switch (event.type) {
      case 'call.created': {
        const msg = `신규 콜 수신 (${event.payload.ani})`;
        set((state) => ({
          activeCalls: [event.payload, ...state.activeCalls],
          selectedCallId: event.payload.callId,
          eventLog: pushLog(state, 'call.created', msg),
        }));
        break;
      }
      case 'call.updated': {
        const msg = `콜 상태가 ${event.payload.sessionStatus} 로 변경되었습니다.`;
        set((state) => ({
          activeCalls: state.activeCalls.map((call) =>
            call.callId === event.payload.callId ? { ...call, ...event.payload } : call,
          ),
          notifications: [msg, ...state.notifications].slice(0, 5),
          eventLog: pushLog(state, 'call.updated', msg),
        }));
        break;
      }
      case 'call.ended': {
        const msg = `통화 종료 이벤트 수신 (${event.payload.talkSeconds}초)`;
        set((state) => ({
          activeCalls: state.activeCalls.map((call) =>
            call.callId === event.payload.callId ? { ...call, sessionStatus: 'ENDED' } : call,
          ),
          recentHistory: (() => {
            const endedCall = state.activeCalls.find((call) => call.callId === event.payload.callId);
            if (!endedCall) return state.recentHistory;

            const item: CallHistoryItem = {
              ...toHistoryItem(endedCall),
              talkSeconds: event.payload.talkSeconds,
            };
            return [item, ...state.recentHistory.filter((history) => history.callId !== item.callId)].slice(0, 20);
          })(),
          notifications: [msg, ...state.notifications].slice(0, 5),
          eventLog: pushLog(state, 'call.ended', msg),
        }));
        break;
      }
      case 'screenpop.customer': {
        const msg = `고객 팝업: ${event.payload.customer.customerName}`;
        set((state) => ({
          activeCalls: state.activeCalls.map((call) =>
            call.callId === event.payload.callId ? { ...call, customer: event.payload.customer } : call,
          ),
          notifications: [msg, ...state.notifications].slice(0, 5),
          eventLog: pushLog(state, 'screenpop.customer', msg),
        }));
        break;
      }
      case 'agent.status.changed': {
        const msg = `상담원 상태 변경: ${event.payload.statusCode}`;
        set((state) => ({
          agentSession: state.agentSession
            ? { ...state.agentSession, statusCode: event.payload.statusCode }
            : null,
          eventLog: pushLog(state, 'agent.status.changed', msg),
        }));
        break;
      }
      case 'queue.summary.updated': {
        set((state) => ({
          queues: event.payload,
          eventLog: pushLog(state, 'queue.summary.updated', 'Queue 요약 갱신'),
        }));
        break;
      }
      default:
        break;
    }
  },
}));
