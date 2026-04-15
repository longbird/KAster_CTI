import { Card, Col, Row, Statistic } from 'antd';
import { useCtiStore } from '../store/useCtiStore';

function formatSeconds(sec: number): string {
  if (!sec || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// cti-operational-frontend 의 KpiPanel 개념을 apps/web 에 포팅.
// 상담원의 오늘 통계와 현재 큐/활성 콜 요약을 4열 카드로 보여준다.
export function KpiPanel() {
  const agentSession = useCtiStore((s) => s.agentSession);
  const queues = useCtiStore((s) => s.queues);
  const activeCalls = useCtiStore((s) => s.activeCalls);

  const totalWaiting = queues.reduce((sum, q) => sum + (q.waitingCount ?? 0), 0);
  const totalTalking = activeCalls.filter((c) => c.sessionStatus === 'TALKING').length;
  const avgTalk = agentSession && agentSession.todayAnswered > 0
    ? Math.round((agentSession.todayTalkSeconds ?? 0) / agentSession.todayAnswered)
    : 0;

  return (
    <Card size="small" title="오늘 요약" bodyStyle={{ padding: 12 }}>
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Statistic title="오늘 응답" value={agentSession?.todayAnswered ?? 0} suffix="건" />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="오늘 평균 통화" value={formatSeconds(avgTalk)} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="현재 대기" value={totalWaiting} suffix="건" />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="현재 통화" value={totalTalking} suffix="건" />
        </Col>
      </Row>
    </Card>
  );
}
