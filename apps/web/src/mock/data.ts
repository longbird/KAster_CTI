import dayjs from 'dayjs';
import type { ActiveCall, AgentSession, CallHistoryItem, QueueSummary } from '../types/cti';

export const initialAgentSession: AgentSession = {
  agentId: 'agent-1001',
  agentName: '박재성',
  extension: '1001',
  statusCode: 'AVAILABLE',
  todayAnswered: 27,
  todayMissed: 1,
  todayTalkSeconds: 7640,
};

export const initialQueues: QueueSummary[] = [
  {
    queueId: 'queue-sales',
    queueName: 'sales',
    waitingCount: 2,
    talkingCount: 5,
    availableAgents: 3,
    longestWaitSeconds: 18,
  },
  {
    queueId: 'queue-support',
    queueName: 'support',
    waitingCount: 1,
    talkingCount: 3,
    availableAgents: 2,
    longestWaitSeconds: 9,
  },
];

export const initialActiveCalls: ActiveCall[] = [
  {
    callId: 'call-001',
    linkedid: '1712978800.001',
    ani: '01012345678',
    dnis: '07012345678',
    queueName: 'sales',
    sessionStatus: 'RINGING_AGENT',
    startedAt: dayjs().subtract(26, 'second').toISOString(),
    queuedAt: dayjs().subtract(20, 'second').toISOString(),
    customer: {
      customerId: 'customer-001',
      customerName: '김고객',
      grade: 'VIP',
      phoneNumber: '01012345678',
      companyName: '서울상사',
      memo: '최근 퀵배차 주문 3회',
      recentOrders: ['서울역 → 강남', '을지로 → 잠실'],
    },
    memo: '',
  },
];

export const recentHistory: CallHistoryItem[] = [
  {
    callId: 'hist-001',
    customerName: '이주문',
    phoneNumber: '01055554444',
    resultCode: 'ORDER_COMPLETE',
    startedAt: dayjs().subtract(15, 'minute').toISOString(),
    talkSeconds: 210,
    queueName: 'sales',
  },
  {
    callId: 'hist-002',
    customerName: '최문의',
    phoneNumber: '01022223333',
    resultCode: 'CALLBACK',
    startedAt: dayjs().subtract(34, 'minute').toISOString(),
    talkSeconds: 75,
    queueName: 'support',
  },
  {
    callId: 'hist-003',
    customerName: '박민원',
    phoneNumber: '01077778888',
    resultCode: 'TRANSFER',
    startedAt: dayjs().subtract(1, 'hour').toISOString(),
    talkSeconds: 320,
    queueName: 'sales',
  },
];
