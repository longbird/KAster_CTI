import { Avatar, Badge, Card, Col, Row, Statistic, Tag, Typography } from 'antd';
import { PhoneOutlined, UserOutlined } from '@ant-design/icons';
import type { AgentSession } from '../types/cti';
import { formatDuration } from '../utils/format';

interface HeaderBarProps {
  session: AgentSession | null;
}

const colorMap: Record<string, string> = {
  AVAILABLE: 'green',
  RINGING: 'gold',
  TALKING: 'blue',
  AFTER_CALL_WORK: 'purple',
  BREAK: 'red',
  MEAL: 'orange',
  TRAINING: 'cyan',
  MANUAL_PAUSED: 'default',
};

export function HeaderBar({ session }: HeaderBarProps) {
  return (
    <Card className="shadow-panel">
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} xl={8}>
          <div className="flex items-center gap-4">
            <Badge status="processing">
              <Avatar size={52} icon={<UserOutlined />} />
            </Badge>
            <div>
              <Typography.Title level={4} className="!mb-1">
                {session?.agentName ?? '상담원'}
              </Typography.Title>
              <div className="flex items-center gap-2">
                <Tag color={colorMap[session?.statusCode ?? 'MANUAL_PAUSED']}>{session?.statusCode ?? '-'}</Tag>
                <span className="text-slate-500">
                  <PhoneOutlined /> 내선 {session?.extension ?? '-'}
                </span>
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} xl={16}>
          <Row gutter={[12, 12]}>
            <Col xs={8} md={8}>
              <Statistic title="응답 콜" value={session?.todayAnswered ?? 0} />
            </Col>
            <Col xs={8} md={8}>
              <Statistic title="미응답" value={session?.todayMissed ?? 0} />
            </Col>
            <Col xs={8} md={8}>
              <Statistic title="통화 시간" value={formatDuration(session?.todayTalkSeconds ?? 0)} />
            </Col>
          </Row>
        </Col>
      </Row>
    </Card>
  );
}
