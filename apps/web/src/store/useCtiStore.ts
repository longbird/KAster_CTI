import { create } from 'zustand';
import {
  cancelAttendedTransferCall,
  completeAttendedTransferCall,
  getActiveCalls,
  getAnnouncements,
  getAgents,
  getAgentSession,
  getCallHistory,
  getQueuesSummary,
  hangupCall,
  holdCall,
  muteCall,
  originateExternalCall,
  originateInternalCall,
  pickupCall,
  saveCallMemo,
  transferCall,
  updateAgentStatus,
} from '../api';
import { connectSocket } from '../ws';
import type {
  ActiveCall,
  AgentDirectoryItem,
  AgentSession,
  Announcement,
  CallHistoryItem,
  CommandAck,
  CtiEvent,
  EventLogItem,
  QueueSummary,
} from '../types/cti';
import { formatPhoneNumber } from '../utils/format';

interface CtiState {
  loading: boolean;
  agentSession: AgentSession | null;
  queues: QueueSummary[];
  agentDirectory: AgentDirectoryItem[];
  announcements: Announcement[];
  activeCalls: ActiveCall[];
  selectedCallId: string | null;
  recentHistory: CallHistoryItem[];
  notifications: string[];
  eventLog: EventLogItem[];
  init: () => Promise<void>;
  selectCall: (callId: string) => void;
  changeStatus: (statusCode: AgentSession['statusCode']) => Promise<void>;
  saveMemo: (memo: string, resultCode: string) => Promise<void>;
  pickup: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleHold: () => Promise<void>;
  transfer: (target: string, mode?: 'blind' | 'attended') => Promise<void>;
  originateExternal: (phoneNumber: string, callerId?: string) => Promise<void>;
  originateInternal: (target: AgentDirectoryItem) => Promise<void>;
  cancelAttendedTransfer: () => Promise<void>;
  completeAttendedTransfer: () => Promise<void>;
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

function enrichCommandMessage(message: string, ack?: Partial<CommandAck> | null): string {
  const correlationId = typeof ack?.correlationId === 'string' ? ack.correlationId.trim() : '';
  const requestedAt = typeof ack?.requestedAt === 'string' ? ack.requestedAt.trim() : '';
  const meta = [correlationId ? `[${correlationId}]` : '', requestedAt].filter(Boolean).join(' ');
  return meta ? `${message} ${meta}` : message;
}

export const useCtiStore = create<CtiState>((set, get) => ({
  loading: true,
  agentSession: null,
  queues: [],
  agentDirectory: [],
  announcements: [],
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

    const [agentSession, queues, activeCalls, recentHistory, agentDirectory, announcements] = await Promise.all([
      safe(getAgentSession(), null as any),
      safe(getQueuesSummary(), [] as any),
      safe(getActiveCalls(), [] as any),
      safe(getCallHistory(), [] as any),
      safe(getAgents(), [] as any),
      safe(getAnnouncements(), [] as any),
    ]);

    set({
      loading: false,
      agentSession,
      queues,
      agentDirectory,
      announcements,
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
  pickup: async () => {
    const callId = get().selectedCallId;
    if (!callId) return;

    const ack = await pickupCall(callId);
    const agent = get().agentSession;
    const msg = enrichCommandMessage(
      `당겨받기 요청이 접수되었습니다. 내선: ${agent?.extension ?? '-'}`,
      ack.data,
    );
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId
          ? { ...call, sessionStatus: 'RINGING_AGENT', primaryAgentId: agent?.agentId }
          : call,
      ),
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  toggleMute: async () => {
    const callId = get().selectedCallId;
    if (!callId) return;

    const current = get().activeCalls.find((call) => call.callId === callId);
    const nextState = current?.isMuted ? 'off' : 'on';
    const ack = await muteCall(callId, nextState);
    const msg = enrichCommandMessage(
      nextState === 'on'
        ? '통화 음소거 요청이 처리되었습니다.'
        : '통화 음소거 해제 요청이 처리되었습니다.',
      ack.data,
    );
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId ? { ...call, isMuted: nextState === 'on' } : call,
      ),
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  toggleHold: async () => {
    const callId = get().selectedCallId;
    if (!callId) return;

    const session = get().agentSession;
    if (!session?.callControlCapabilities?.holdEnabled) {
      throw new Error('현재 PBX 설정에서는 hold/resume 제어가 비활성화되어 있습니다.');
    }

    const current = get().activeCalls.find((call) => call.callId === callId);
    const action = current?.sessionStatus === 'HOLD' ? 'resume' : 'hold';
    const ack = await holdCall(callId, action);
    const msg = enrichCommandMessage(
      action === 'hold'
        ? '보류 요청이 접수되었습니다. 실제 상태는 PBX 이벤트를 기다립니다.'
        : '보류 해제 요청이 접수되었습니다. 실제 상태는 PBX 이벤트를 기다립니다.',
      ack.data,
    );
    set((state) => ({
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  transfer: async (target, mode = 'blind') => {
    const callId = get().selectedCallId;
    if (!callId) return;

    const ack = await transferCall(callId, target, mode);
    const msg = enrichCommandMessage(
      mode === 'attended'
        ? `상담 전환 요청이 접수되었습니다. 대상: ${target}`
        : `호 전환 요청이 접수되었습니다. 대상: ${target}`,
      ack.data,
    );
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId
          ? {
              ...call,
              sessionStatus: 'TRANSFERRING',
              latestTransfer: mode === 'attended'
                ? {
                    phase: 'REQUESTED',
                    toExtension: target,
                    requestedAt: new Date().toISOString(),
                    completedAt: null,
                    expiredAt: null,
                  }
                : call.latestTransfer ?? null,
            }
          : call,
      ),
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  originateExternal: async (phoneNumber, callerId) => {
    const normalized = phoneNumber.trim();
    if (!normalized) return;
    const capabilities = get().agentSession?.callCapabilities;
    if (!capabilities?.canOriginateExternal) {
      throw new Error(capabilities?.disabledReasons[0] ?? '외부 발신 권한이 없습니다.');
    }

    const ack = await originateExternalCall(normalized, callerId);
    const msg = enrichCommandMessage(
      `외부 발신 요청이 접수되었습니다. 대상: ${formatPhoneNumber(normalized)}${callerId ? ` / 발신번호 ${formatPhoneNumber(callerId)}` : ''}`,
      ack.data,
    );
    set((state) => ({
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  originateInternal: async (target) => {
    const ack = await originateInternalCall(target.agentId, target.extension);
    const msg = enrichCommandMessage(
      `내선 통화 요청이 접수되었습니다. 대상: ${target.agentName} (${target.extension})`,
      ack.data,
    );
    set((state) => ({
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  cancelAttendedTransfer: async () => {
    const callId = get().selectedCallId;
    if (!callId) return;

    const ack = await cancelAttendedTransferCall(callId);
    const msg = enrichCommandMessage(
      '상담 전환 취소 요청이 처리되었습니다.',
      ack.data,
    );
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId
          ? {
              ...call,
              sessionStatus: call.answeredAt ? 'TALKING' : 'RINGING_AGENT',
              latestTransfer: null,
            }
          : call,
      ),
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  completeAttendedTransfer: async () => {
    const callId = get().selectedCallId;
    if (!callId) return;

    const ack = await completeAttendedTransferCall(callId);
    const msg = enrichCommandMessage(
      '상담 전환 완료 요청이 처리되었습니다.',
      ack.data,
    );
    set((state) => ({
      activeCalls: state.activeCalls.map((call) =>
        call.callId === callId
          ? {
              ...call,
              sessionStatus: 'TRANSFERRING',
              latestTransfer: call.latestTransfer
                ? {
                    ...call.latestTransfer,
                    phase: 'REBRIDGING',
                  }
                : call.latestTransfer,
            }
          : call,
      ),
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  hangup: async () => {
    const callId = get().selectedCallId;
    if (!callId) return;

    const ack = await hangupCall(callId);
    const msg = enrichCommandMessage(
      '통화 종료 요청이 접수되었습니다. 실제 종료는 PBX 이벤트를 기다립니다.',
      ack.data,
    );
    set((state) => ({
      notifications: [msg, ...state.notifications].slice(0, 5),
      eventLog: pushLog(state, 'info', msg),
    }));
  },
  applyEvent: (event) => {
    switch (event.type) {
      case 'call.created': {
        const msg = `신규 콜 수신 (${formatPhoneNumber(event.payload.ani)})`;
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
          agentSession: state.agentSession?.agentId === event.payload.agentId
            ? { ...state.agentSession, statusCode: event.payload.statusCode }
            : state.agentSession,
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
