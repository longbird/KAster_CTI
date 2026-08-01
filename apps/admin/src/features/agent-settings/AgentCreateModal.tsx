import { QuestionCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Card, Checkbox, Col, Form, Input, Modal, Row, Select, Tooltip, Typography, message } from 'antd';
import { type CSSProperties, useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import {
  AGENT_TYPE_OPTIONS,
  CLOSE_STATUS_PERMISSION_OPTIONS,
  DEFAULT_AGENT_SETTINGS_PROFILE,
  INOUT_TYPE_OPTIONS,
  NUMBER_MASKING_OPTIONS,
  PICKUP_TYPE_OPTIONS,
  POPUP_CLOSE_READY_OPTIONS,
  READY_DELAY_OPTIONS,
  SIMPLE_USE_OPTIONS,
} from './agentSettingProfile';
import { EXTENSION_LOCK_MODE_OPTIONS } from './extensionPolicy';

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
  isActive?: boolean;
}

interface AgentGroupOption {
  agentGroupId: string;
  groupCode: string;
  groupName: string;
  isActive?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ROLE_OPTIONS = [
  { value: 'agent', label: '상담원' },
  { value: 'supervisor', label: '슈퍼바이저' },
  { value: 'admin', label: '관리자' },
];

function labelWithHelp(label: string, help?: string) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>{label}</span>
      {help ? (
        <Tooltip title={help}>
          <QuestionCircleOutlined style={{ color: '#8c8c8c', cursor: 'help' }} />
        </Tooltip>
      ) : null}
    </span>
  );
}

function SectionTitle({ title, help }: { title: string; help?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      {help ? (
        <Tooltip title={help}>
          <QuestionCircleOutlined style={{ color: '#8c8c8c', cursor: 'help' }} />
        </Tooltip>
      ) : null}
    </div>
  );
}

const PANEL_STYLE: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(195, 197, 215, 0.45)',
  boxShadow: '0 10px 24px rgba(25, 28, 29, 0.04)',
};

const PANEL_BODY_STYLE: CSSProperties = {
  padding: 20,
};

export function AgentCreateModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm();
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [agentGroups, setAgentGroups] = useState<AgentGroupOption[]>([]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }

    void apiClient
      .get('/queues')
      .then((res) => setQueues((res.data?.data ?? []).filter((q: QueueOption) => q.isActive !== false)))
      .catch(() => setQueues([]));
    void apiClient
      .get('/admin/settings/agent-groups')
      .then((res) =>
        setAgentGroups(
          (res.data?.data ?? []).filter((g: AgentGroupOption) => g.isActive !== false),
        ),
      )
      .catch(() => setAgentGroups([]));
  }, [form, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.post('/agents', values);
      message.success('상담원 생성 완료');
      form.resetFields();
      onCreated();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '생성 실패';
      message.error(msg);
    }
  };

  return (
    <Modal
      title={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(19, 83, 216, 0.08)',
              color: '#1353d8',
            }}
          >
            <SettingOutlined style={{ fontSize: 22 }} />
          </div>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              상담원 설정
            </Typography.Title>
          </div>
        </div>
      )}
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      destroyOnClose
      width={1080}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '8px 0' }}>
          <Button onClick={onClose}>취소</Button>
          <Button type="primary" onClick={() => void handleOk()}>
            등록
          </Button>
        </div>
      )}
      styles={{
        header: { padding: '24px 28px 18px', borderBottom: '1px solid rgba(195, 197, 215, 0.35)' },
        body: { maxHeight: '75vh', overflowY: 'auto', overflowX: 'hidden', padding: 28, background: '#f8f9fa' },
        footer: { padding: '16px 28px 20px', borderTop: '1px solid rgba(195, 197, 215, 0.25)', background: '#f3f4f5' },
        content: { borderRadius: 20, overflow: 'hidden' },
      }}
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ role: 'agent', extensionLockMode: 'UNLOCKED', settingsProfile: DEFAULT_AGENT_SETTINGS_PROFILE }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            <Card style={PANEL_STYLE} styles={{ body: PANEL_BODY_STYLE }}>
              <SectionTitle title="기본 정보" help="상담원의 계정과 대표 소속 정보를 설정합니다." />
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="상담원ID" name="agentCode" rules={[{ required: true, max: 32 }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="상담원명" name="agentName" rules={[{ required: true, max: 128 }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="권한" name="role">
                    <Select options={ROLE_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="로그인 ID" name="loginId" rules={[{ required: true, max: 64 }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="비밀번호" name="password" rules={[{ required: true, min: 8, max: 64 }]}>
                    <Input.Password />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label={labelWithHelp('대표 큐', '상담원의 기본 큐입니다. 실제 큐 멤버십은 큐 설정에서 별도로 관리합니다.')}
                    name="defaultQueueId"
                  >
                    <Select
                      allowClear
                      placeholder="대표 큐 선택"
                      options={queues.map((q) => ({
                        value: q.queueId,
                        label: q.queueDisplayName ?? q.queueName,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label={labelWithHelp('상담원 그룹', '조직/팀 단위 분류. 호분배 룰·통계에서 사용합니다.')}
                    name="agentGroupId"
                  >
                    <Select
                      allowClear
                      placeholder="그룹 선택"
                      options={agentGroups.map((g) => ({
                        value: g.agentGroupId,
                        label: `${g.groupName} (${g.groupCode})`,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label="내선번호"
                    name="extension"
                    rules={[
                      { required: true, max: 16 },
                      { pattern: /^\d+$/, message: '숫자만 허용' },
                    ]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="내선 표시명" name="extensionDisplayName" rules={[{ max: 128 }]}>
                    <Input placeholder="예: 본사 1번 데스크" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="내선 잠금" name="extensionLockMode" rules={[{ required: true }]}>
                    <Select options={EXTENSION_LOCK_MODE_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="상담원설명" name={['settingsProfile', 'description']}>
                    <Input.TextArea rows={3} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>

          <Col xs={24} xl={12}>
            <Card style={PANEL_STYLE} styles={{ body: PANEL_BODY_STYLE }}>
              <SectionTitle title="운영 설정" help="현재 버전에서 실제 PBX 동작과 연결된 상담원 운영 옵션입니다." />
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="인아웃타입" name={['settingsProfile', 'inoutType']}>
                    <Select options={INOUT_TYPE_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="번호가림" name={['settingsProfile', 'numberMasking']}>
                    <Select options={NUMBER_MASKING_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="당겨받기" name={['settingsProfile', 'pickupType']}>
                    <Select options={PICKUP_TYPE_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="수발신 권한 설정 고정" name={['settingsProfile', 'outboundAccessFixed']}>
                    <Select options={NUMBER_MASKING_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="관리자권한" name={['settingsProfile', 'adminPermission']}>
                    <Select options={NUMBER_MASKING_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="상담원 타입" name={['settingsProfile', 'agentType']}>
                    <Select options={AGENT_TYPE_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      padding: 16,
                      borderRadius: 14,
                      background: '#ffffff',
                      border: '1px solid rgba(195, 197, 215, 0.35)',
                    }}
                  >
                    <div>
                      <Typography.Text strong style={{ display: 'block' }}>
                        실시간 녹취 사용
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        모든 통화 연결 시점에 따라 녹취 정책을 적용합니다.
                      </Typography.Text>
                    </div>
                    <Form.Item name={['settingsProfile', 'liveRecording']} noStyle>
                      <Select
                        style={{ width: 120 }}
                        options={SIMPLE_USE_OPTIONS}
                      />
                    </Form.Item>
                  </div>
                </Col>
                <Col span={24}>
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 14,
                      background: '#ffffff',
                      border: '1px solid rgba(195, 197, 215, 0.35)',
                    }}
                  >
                    <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                      발신 번호 권한
                    </Typography.Text>
                    <Row gutter={[12, 8]}>
                      <Col xs={24} sm={12}>
                        <Form.Item name={['settingsProfile', 'outboundDialPermissions', 'phoneDirect']} valuePropName="checked" style={{ marginBottom: 0 }}>
                          <Checkbox>전화기 직접 발신</Checkbox>
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name={['settingsProfile', 'outboundDialPermissions', 'domestic']} valuePropName="checked" style={{ marginBottom: 0 }}>
                          <Checkbox>국내 일반번호</Checkbox>
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name={['settingsProfile', 'outboundDialPermissions', 'representative']} valuePropName="checked" style={{ marginBottom: 0 }}>
                          <Checkbox>대표번호</Checkbox>
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name={['settingsProfile', 'outboundDialPermissions', 'paid']} valuePropName="checked" style={{ marginBottom: 0 }}>
                          <Checkbox>060 유료번호</Checkbox>
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name={['settingsProfile', 'outboundDialPermissions', 'international']} valuePropName="checked" style={{ marginBottom: 0 }}>
                          <Checkbox>해외번호</Checkbox>
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>

          <Col span={24}>
            <Card style={PANEL_STYLE} styles={{ body: PANEL_BODY_STYLE }}>
              <SectionTitle title="통화 종료 후 상태" help="업무처리 자동 전환과 상담대기 복귀 조건을 함께 설정합니다." />
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item label="설정 권한" name={['settingsProfile', 'closeStatusPermission']}>
                    <Select options={CLOSE_STATUS_PERMISSION_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="업무처리 후 상담대기 복귀" name={['settingsProfile', 'acwToReadyDelay']}>
                    <Select options={READY_DELAY_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="접수창 종료 후 상담대기 복귀" name={['settingsProfile', 'popupCloseToReady']}>
                    <Select options={POPUP_CLOSE_READY_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name={['settingsProfile', 'autoChangeToAcw']} valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Checkbox>통화 종료 시 '업무처리' 상태로 자동 변경</Checkbox>
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
