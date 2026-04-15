import dayjs from 'dayjs';
import type { ActiveCall, CtiEvent } from '../types/cti';

const buildTalkingCall = (): ActiveCall => ({
  callId: 'call-001',
  linkedid: '1712978800.001',
  ani: '01012345678',
  dnis: '07012345678',
  queueName: 'sales',
  sessionStatus: 'TALKING',
  startedAt: dayjs().subtract(40, 'second').toISOString(),
  queuedAt: dayjs().subtract(32, 'second').toISOString(),
  answeredAt: dayjs().subtract(8, 'second').toISOString(),
  primaryAgentId: 'agent-1001',
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
});

export function connectMockSocket(onEvent: (event: CtiEvent) => void): () => void {
  const timers: number[] = [];

  timers.push(
    window.setTimeout(() => {
      onEvent({
        type: 'screenpop.customer',
        payload: {
          callId: 'call-001',
          customer: {
            customerId: 'customer-001',
            customerName: '김고객',
            grade: 'VIP',
            phoneNumber: '01012345678',
            companyName: '서울상사',
            memo: '최근 퀵배차 주문 3회',
            recentOrders: ['서울역 → 강남', '을지로 → 잠실'],
          },
        },
      });
    }, 1000),
  );

  timers.push(
    window.setTimeout(() => {
      onEvent({ type: 'call.updated', payload: buildTalkingCall() });
      onEvent({ type: 'agent.status.changed', payload: { agentId: 'agent-1001', statusCode: 'TALKING' } });
      onEvent({
        type: 'queue.summary.updated',
        payload: [
          {
            queueId: 'queue-sales',
            queueName: 'sales',
            waitingCount: 1,
            talkingCount: 6,
            availableAgents: 2,
            longestWaitSeconds: 11,
          },
          {
            queueId: 'queue-support',
            queueName: 'support',
            waitingCount: 1,
            talkingCount: 3,
            availableAgents: 2,
            longestWaitSeconds: 9,
          },
        ],
      });
    }, 3500),
  );

  timers.push(
    window.setTimeout(() => {
      onEvent({
        type: 'call.ended',
        payload: {
          callId: 'call-001',
          endedAt: dayjs().toISOString(),
          talkSeconds: 153,
        },
      });
      onEvent({ type: 'agent.status.changed', payload: { agentId: 'agent-1001', statusCode: 'AFTER_CALL_WORK' } });
    }, 8500),
  );

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}
