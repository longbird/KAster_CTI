import {
  Avatar,
  Badge,
  Card,
  Col,
  Dropdown,
  Row,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { DownOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { AgentSession, AgentStatusCode } from '../types/cti';
import { formatDuration } from '../utils/format';

interface HeaderBarProps {
  session: AgentSession | null;
  onChangeStatus?: (status: AgentStatusCode) => void;
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

// 상담원이 직접 변경 가능한 상태만 노출. RINGING/TALKING/AFTER_CALL_WORK 는
// 시스템(AMI 이벤트)이 유도하는 상태라 수동 선택 금지.
const SELECTABLE_STATUSES: AgentStatusCode[] = [
  'AVAILABLE',
  'BREAK',
  'MEAL',
  'TRAINING',
  'MANUAL_PAUSED',
];

const STATUS_LABEL: Record<AgentStatusCode, string> = {
  AVAILABLE: '대기 (AVAILABLE)',
  RINGING: '벨 울림 (RINGING)',
  TALKING: '통화 중 (TALKING)',
  AFTER_CALL_WORK: '후처리 (ACW)',
  BREAK: '휴식 (BREAK)',
  MEAL: '식사 (MEAL)',
  TRAINING: '교육 (TRAINING)',
  MANUAL_PAUSED: '수동 일시정지',
};

export function HeaderBar({ session, onChangeStatus }: HeaderBarProps) {
  const currentStatus = session?.statusCode ?? 'MANUAL_PAUSED';

  const menu: MenuProps = {
    items: SELECTABLE_STATUSES.map((status) => ({
      key: status,
      label: STATUS_LABEL[status],
      disabled: status === currentStatus,
    })),
    onClick: ({ key }) => {
      onChangeStatus?.(key as AgentStatusCode);
    },
  };

  const statusTag = (
    <Tag
      color={colorMap[currentStatus]}
      className="!m-0"
      style={{ cursor: onChangeStatus ? 'pointer' : 'default', userSelect: 'none' }}
    >
      {currentStatus} {onChangeStatus && <DownOutlined className="text-[10px]" />}
    </Tag>
  );

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
                {onChangeStatus ? (
                  <Dropdown menu={menu} trigger={['click']}>
                    {statusTag}
                  </Dropdown>
                ) : (
                  statusTag
                )}
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
