import type { DashboardData } from '../types/dashboard';

export const baseDashboardData: DashboardData = {
  updatedAt: new Date().toISOString(),
  kpis: [
    { key: 'waiting', label: '현재 대기 콜', value: '18', delta: '+3', trend: 'up' },
    { key: 'sla', label: '응답률', value: '91.4%', delta: '+1.8%', trend: 'up' },
    { key: 'abandon', label: '포기율', value: '4.7%', delta: '-0.8%', trend: 'down' },
    { key: 'wait', label: '평균 대기시간', value: '00:42', delta: '-9초', trend: 'down' },
    { key: 'live', label: '실시간 통화', value: '27', delta: '+2', trend: 'up' },
    { key: 'agents', label: '가용 상담원', value: '36', delta: '-1', trend: 'down' },
  ],
  queues: [
    { queueName: '대표', waiting: 6, talking: 10, availableAgents: 12, longestWaitSec: 74, answerRate: 94, abandoned: 1, slaBreached: 2 },
    { queueName: '예약', waiting: 4, talking: 7, availableAgents: 8, longestWaitSec: 61, answerRate: 89, abandoned: 2, slaBreached: 1 },
    { queueName: 'VIP', waiting: 1, talking: 3, availableAgents: 5, longestWaitSec: 18, answerRate: 99, abandoned: 0, slaBreached: 0 },
    { queueName: '불만', waiting: 7, talking: 7, availableAgents: 4, longestWaitSec: 121, answerRate: 82, abandoned: 3, slaBreached: 4 },
  ],
  teams: [
    { teamName: '인바운드 A', available: 8, ringing: 2, talking: 10, acw: 3, break: 1 },
    { teamName: '인바운드 B', available: 9, ringing: 1, talking: 8, acw: 2, break: 2 },
    { teamName: '예약 전담', available: 7, ringing: 1, talking: 5, acw: 1, break: 1 },
    { teamName: 'VOC', available: 3, ringing: 1, talking: 4, acw: 1, break: 1 },
  ],
  agentStatuses: [
    { statusCode: 'AVAILABLE', label: '대기', count: 27 },
    { statusCode: 'RINGING', label: '호출', count: 5 },
    { statusCode: 'TALKING', label: '통화', count: 27 },
    { statusCode: 'AFTER_CALL_WORK', label: '후처리', count: 7 },
    { statusCode: 'BREAK', label: '휴식', count: 5 },
  ],
  activeCalls: [
    { id: 'CALL-2401', queueName: '대표', agentName: '김지은', customerPhone: '010-2234-7788', direction: 'inbound', waitingSec: 28, talkingSec: 313, status: 'TALKING' },
    { id: 'CALL-2402', queueName: '예약', agentName: '박민수', customerPhone: '010-8841-1255', direction: 'inbound', waitingSec: 19, talkingSec: 96, status: 'TALKING' },
    { id: 'CALL-2403', queueName: '불만', agentName: '이서연', customerPhone: '010-3345-2229', direction: 'inbound', waitingSec: 54, talkingSec: 0, status: 'RINGING_AGENT' },
    { id: 'CALL-2404', queueName: 'VIP', agentName: '정유진', customerPhone: '010-7788-3333', direction: 'outbound', waitingSec: 0, talkingSec: 622, status: 'TRANSFERRING' },
  ],
  alerts: [
    { id: 'ALT-1', level: 'warning', message: '불만 큐 대기시간이 SLA 60초를 초과했습니다.', time: '방금 전' },
    { id: 'ALT-2', level: 'info', message: 'AMI 연결이 재수립되었습니다.', time: '2분 전' },
    { id: 'ALT-3', level: 'error', message: '예약 큐 상담원 1명이 후처리 상태에 장시간 머물고 있습니다.', time: '4분 전' },
  ],
  traffic: [
    { hour: '09시', inbound: 45, answered: 42, abandoned: 3 },
    { hour: '10시', inbound: 58, answered: 54, abandoned: 4 },
    { hour: '11시', inbound: 64, answered: 59, abandoned: 5 },
    { hour: '12시', inbound: 37, answered: 33, abandoned: 4 },
    { hour: '13시', inbound: 41, answered: 38, abandoned: 3 },
    { hour: '14시', inbound: 72, answered: 66, abandoned: 6 },
    { hour: '15시', inbound: 69, answered: 63, abandoned: 6 },
    { hour: '16시', inbound: 61, answered: 56, abandoned: 5 },
  ],
};
