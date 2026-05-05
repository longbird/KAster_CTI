import dayjs from 'dayjs';
import type { ActiveCall, AgentDirectoryItem, AgentSession, Announcement, CallHistoryItem, QueueSummary } from '../types/cti';

export const initialAgentSession: AgentSession = {
  agentId: 'agent-1001',
  agentName: '박재성',
  extension: '1001',
  statusCode: 'AVAILABLE',
  todayAnswered: 27,
  todayMissed: 1,
  todayTalkSeconds: 7640,
  outboundDialOptions: {
    allowedCallerIds: ['07052346380', '07052346381'],
    defaultCallerId: '07052346380',
  },
};

export const initialAgentDirectory: AgentDirectoryItem[] = [
  {
    agentId: 'agent-1001',
    agentName: '박재성',
    extension: '1001',
    role: 'agent',
    isActive: true,
    currentStatus: { statusCode: 'AVAILABLE' },
  },
  {
    agentId: 'agent-1002',
    agentName: '김소연',
    extension: '1002',
    role: 'agent',
    isActive: true,
    currentStatus: { statusCode: 'TALKING' },
  },
  {
    agentId: 'agent-2001',
    agentName: '이수빈',
    extension: '2001',
    role: 'supervisor',
    isActive: true,
    currentStatus: { statusCode: 'AFTER_CALL_WORK' },
  },
];

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

export const initialAnnouncements: Announcement[] = [
  {
    announcementId: 'notice-1',
    title: '긴급 배차 지연',
    body: '우선 안내 후 콜백 처리',
    authorName: '관리자',
    pinned: true,
    createdAt: dayjs().subtract(5, 'minute').toISOString(),
    updatedAt: dayjs().subtract(5, 'minute').toISOString(),
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
