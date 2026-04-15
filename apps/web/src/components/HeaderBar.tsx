import { Avatar, Badge, Card, Col, Row, Statistic, Typography } from 'antd';
import { PhoneOutlined, UserOutlined } from '@ant-design/icons';
import type { AgentSession, AgentStatusCode } from '../types/cti';
import { formatDuration } from '../utils/format';
import { AgentStatusTag } from './AgentStatusTag';

interface HeaderBarProps {
  session: AgentSession | null;
  onChangeStatus?: (status: AgentStatusCode) => void;
}

export function HeaderBar({ session, onChangeStatus }: HeaderBarProps) {
  return (
    <Card className="shadow-panel">
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} xl={8}>
          <div className="flex items-center gap-4">
            <Badge status="processing">
              <Avatar size={52} icon={<UserOutlined />} />
            </Badge>
            <div className="min-w-0">
              <Typography.Title level={4} className="!mb-1">
                {session?.agentName ?? '상담원'}
              </Typography.Title>
              <div className="flex items-center gap-2">
                <AgentStatusTag status={session?.statusCode} onChange={onChangeStatus} />
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
              <Statistic
                title="통화 시간"
                value={formatDuration(session?.todayTalkSeconds ?? 0)}
              />
            </Col>
          </Row>
        </Col>
      </Row>
    </Card>
  );
}
