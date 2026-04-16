import { Button, Descriptions, Drawer, Popconfirm, Tag, message } from 'antd';
import { apiClient } from '../../shared/lib/apiClient';

export interface CallRow {
  callId: string;
  linkedid: string;
  ani: string;
  dnis?: string;
  queueName?: string;
  primaryAgentId?: string;
  agentName?: string;
  sessionStatus: string;
  queuedAt?: string;
  answeredAt?: string;
  waitSeconds?: number;
  talkSeconds?: number;
}

interface Props {
  call: CallRow | null;
  onClose: () => void;
  onHangup: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  QUEUED: 'gold',
  RINGING_AGENT: 'blue',
  TALKING: 'green',
  AFTER_CALL_WORK: 'purple',
};

export function CallDetailDrawer({ call, onClose, onHangup }: Props) {
  const handleHangup = async () => {
    if (!call) return;
    try {
      await apiClient.post(`/calls/${call.callId}/hangup`);
      message.success('강제 종료 요청 완료');
      onHangup();
      onClose();
    } catch {
      message.error('강제 종료 실패');
    }
  };

  return (
    <Drawer
      title="통화 상세"
      open={!!call}
      onClose={onClose}
      width={480}
      extra={
        <Popconfirm title="강제 종료하시겠습니까?" onConfirm={() => void handleHangup()}>
          <Button danger size="small">강제 종료</Button>
        </Popconfirm>
      }
    >
      {call && (
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Call ID">{call.callId}</Descriptions.Item>
          <Descriptions.Item label="Linked ID">{call.linkedid}</Descriptions.Item>
          <Descriptions.Item label="고객 번호">{call.ani}</Descriptions.Item>
          <Descriptions.Item label="DID">{call.dnis ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="큐">{call.queueName ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="상담원">{call.agentName || call.primaryAgentId || '-'}</Descriptions.Item>
          <Descriptions.Item label="상태">
            <Tag color={STATUS_COLOR[call.sessionStatus] ?? 'default'}>{call.sessionStatus}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="대기시간">{call.waitSeconds ?? 0}s</Descriptions.Item>
          <Descriptions.Item label="통화시간">{call.talkSeconds ?? 0}s</Descriptions.Item>
          <Descriptions.Item label="큐 진입">
            {call.queuedAt ? new Date(call.queuedAt).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="응답">
            {call.answeredAt ? new Date(call.answeredAt).toLocaleString() : '-'}
          </Descriptions.Item>
        </Descriptions>
      )}
    </Drawer>
  );
}
