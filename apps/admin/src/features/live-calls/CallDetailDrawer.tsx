import { useEffect, useState } from 'react';
import { Button, Descriptions, Drawer, Empty, List, Popconfirm, Space, Spin, Tag, Typography, message } from 'antd';
import { apiClient } from '../../shared/lib/apiClient';
import { formatPhoneNumber } from '../../shared/lib/format';
import { usePermissionStore } from '../../store/usePermissionStore';
import { SESSION_STATUS_TONE, TRANSFER_PHASE_TONE } from '../../shared/ui/tagTone';

export interface CallRow {
  callId: string;
  linkedid: string;
  ani: string;
  dnis?: string;
  didNumber?: string | null;
  representativeNumber?: string | null;
  queueName?: string;
  primaryAgentId?: string;
  agentName?: string;
  sessionStatus: string;
  queuedAt?: string;
  answeredAt?: string;
  waitSeconds?: number;
  talkSeconds?: number;
  latestTransfer?: {
    phase: string;
    toExtension?: string | null;
  } | null;
}

interface CallDetailResponse extends CallRow {
  callTransfers?: Array<{
    transferId: string;
    transferType: string;
    fromExtension?: string | null;
    toExtension?: string | null;
    transferResult?: string | null;
    requestedAt: string;
    completedAt?: string | null;
  }>;
  transferCandidates?: Array<{
    candidateId: string;
    phase: string;
    fromExtension?: string | null;
    toExtension?: string | null;
    requestedAt: string;
    completedAt?: string | null;
    expiredAt?: string | null;
  }>;
}

interface Props {
  call: CallRow | null;
  onClose: () => void;
  onHangup: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  QUEUED: '대기열',
  RINGING_AGENT: '벨 울림',
  TALKING: '통화 중',
  AFTER_CALL_WORK: '후처리',
  TRANSFERRING: '전환 중',
  ENDED: '종료',
};

const TRANSFER_PHASE_LABEL: Record<string, string> = {
  REQUESTED: '요청됨',
  CONSULT_RINGING: '협의 호출',
  CONSULT_TALKING: '협의 통화',
  REBRIDGING: '재연결 중',
  COMPLETED: '완료',
  FAILED: '실패',
  EXPIRED: '만료',
};

function getStatusLabel(value?: string | null) {
  if (!value) return '-';
  return STATUS_LABEL[value] ?? '알 수 없음';
}

function getTransferPhaseLabel(value?: string | null) {
  if (!value) return '-';
  return TRANSFER_PHASE_LABEL[value] ?? '알 수 없음';
}

function fmtDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

export function CallDetailDrawer({ call, onClose, onHangup }: Props) {
  const [detail, setDetail] = useState<CallDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const dashboardPermission = usePermissionStore((s) => s.permissionsByMenu.dashboard);
  const liveCallsPermission = usePermissionStore((s) => s.permissionsByMenu['live-calls']);
  const canOperate =
    liveCallsPermission?.canOperate ??
    dashboardPermission?.canOperate ??
    true;

  useEffect(() => {
    if (!call?.callId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/calls/${call.callId}`);
        if (!cancelled) {
          setDetail(res.data?.data ?? null);
        }
      } catch {
        if (!cancelled) {
          setDetail(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [call?.callId]);

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
      width={560}
      extra={
        canOperate ? (
          <Popconfirm title="강제 종료하시겠습니까?" onConfirm={() => void handleHangup()}>
            <Button danger size="small">강제 종료</Button>
          </Popconfirm>
        ) : null
      }
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <Spin />
        </div>
      ) : detail ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Call ID">{detail.callId}</Descriptions.Item>
            <Descriptions.Item label="Linked ID">{detail.linkedid}</Descriptions.Item>
            <Descriptions.Item label="고객 번호">{formatPhoneNumber(detail.ani)}</Descriptions.Item>
            <Descriptions.Item label="대표번호">{formatPhoneNumber(detail.representativeNumber)}</Descriptions.Item>
            <Descriptions.Item label="DID">{formatPhoneNumber(detail.didNumber ?? detail.dnis)}</Descriptions.Item>
            <Descriptions.Item label="큐">{detail.queueName ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="상담원">{detail.agentName || detail.primaryAgentId || '-'}</Descriptions.Item>
            <Descriptions.Item label="상태">
              <Tag color={SESSION_STATUS_TONE[detail.sessionStatus] ?? 'default'}>{getStatusLabel(detail.sessionStatus)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="전환 상태">
              {detail.transferCandidates?.[0] ? (
                <Tag color={TRANSFER_PHASE_TONE[detail.transferCandidates[0].phase] ?? 'default'}>
                  {getTransferPhaseLabel(detail.transferCandidates[0].phase)}
                </Tag>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="대기시간">{detail.waitSeconds ?? 0}s</Descriptions.Item>
            <Descriptions.Item label="통화시간">{detail.talkSeconds ?? 0}s</Descriptions.Item>
            <Descriptions.Item label="큐 진입">{fmtDateTime(detail.queuedAt)}</Descriptions.Item>
            <Descriptions.Item label="응답">{fmtDateTime(detail.answeredAt)}</Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Title level={5} style={{ marginBottom: 8 }}>
              전환 후보 상태
            </Typography.Title>
            {detail.transferCandidates?.length ? (
              <List
                size="small"
                bordered
                dataSource={detail.transferCandidates}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <Typography.Text>
                          {item.fromExtension ?? '-'} → {item.toExtension ?? '-'}
                        </Typography.Text>
                        <Tag color={TRANSFER_PHASE_TONE[item.phase] ?? 'default'}>{getTransferPhaseLabel(item.phase)}</Tag>
                      </div>
                      <Typography.Text type="secondary">
                        요청 {fmtDateTime(item.requestedAt)}
                        {item.completedAt ? ` / 완료 ${fmtDateTime(item.completedAt)}` : ''}
                        {item.expiredAt ? ` / 만료 ${fmtDateTime(item.expiredAt)}` : ''}
                      </Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="전환 후보 기록이 없습니다." />
            )}
          </div>

          <div>
            <Typography.Title level={5} style={{ marginBottom: 8 }}>
              전환 요청 이력
            </Typography.Title>
            {detail.callTransfers?.length ? (
              <List
                size="small"
                bordered
                dataSource={detail.callTransfers}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <Typography.Text>
                          {item.transferType} / {item.fromExtension ?? '-'} → {item.toExtension ?? '-'}
                        </Typography.Text>
                        <Tag color={TRANSFER_PHASE_TONE[item.transferResult ?? 'REQUESTED'] ?? 'default'}>
                          {getTransferPhaseLabel(item.transferResult ?? 'REQUESTED')}
                        </Tag>
                      </div>
                      <Typography.Text type="secondary">
                        요청 {fmtDateTime(item.requestedAt)}
                        {item.completedAt ? ` / 종료 ${fmtDateTime(item.completedAt)}` : ''}
                      </Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="전환 요청 기록이 없습니다." />
            )}
          </div>
        </Space>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="통화 상세를 불러오지 못했습니다." />
      )}
    </Drawer>
  );
}
