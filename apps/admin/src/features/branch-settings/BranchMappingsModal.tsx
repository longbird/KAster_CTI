import { Alert, Button, Card, Col, Collapse, Form, Modal, Row, Select, Space, Switch, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../shared/lib/apiClient';
import { formatPhoneNumber } from '../../shared/lib/format';
import type { BranchRow } from './BranchEditModal';

interface AgentOption {
  agentId: string;
  agentName: string;
  extension: string;
  role: string;
}

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string | null;
}

interface BranchSettingsProfile {
  routing?: { enabled: boolean };
  forwarding?: { enabled: boolean; ids?: string[] };
  prompts?: { enabled: boolean; ids?: string[] };
  ars?: { enabled: boolean; ids?: string[] };
  smartArs?: { enabled: boolean };
  recording?: { enabled: boolean };
  blocklist080?: { enabled: boolean };
  cid?: { enabled: boolean; defaultOutboundCallerId?: string | null };
  smdr?: { enabled: boolean };
}

interface MappingResponse {
  branch: {
    branchId: string;
    branchCode: string;
    branchName: string;
    description?: string | null;
    isActive: boolean;
  } | null;
  assignedAgentIds: string[];
  assignedQueueIds: string[];
  assignedDidIds: string[];
  settingsProfile?: BranchSettingsProfile;
  availableAgents: AgentOption[];
  availableQueues: QueueOption[];
  availableDids: Array<{ id: string; did: string; description?: string | null }>;
  availablePrompts: Array<{ id: string; displayName: string; promptKey: string; category: string }>;
  availableIvrMenus: Array<{ id: string; name: string; timeoutSecs: number }>;
  availableForwardingRules: Array<{
    id: string;
    forwardType: 'EXTENSION' | 'QUEUE' | 'EXTERNAL_NUMBER';
    targetValue: string;
    conditionType: 'ALWAYS' | 'TIME_RANGE';
    did: {
      id: string;
      did: string;
      description?: string | null;
    };
  }>;
  availableCallerIds: string[];
  defaultSystemRecordingEnabled: boolean;
  defaultSystemCallerId: string | null;
}

interface BranchOperationFormValue {
  agentIds: string[];
  queueIds: string[];
  didIds: string[];
  routingEnabled: boolean;
  forwardingEnabled: boolean;
  forwardingRuleIds: string[];
  promptsEnabled: boolean;
  promptIds: string[];
  smartArsEnabled: boolean;
  recordingEnabled: boolean;
  blocklist080Enabled: boolean;
  cidEnabled: boolean;
  defaultOutboundCallerId?: string;
  smdrEnabled: boolean;
}

interface Props {
  open: boolean;
  branch: BranchRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const FORWARD_TYPE_LABEL: Record<string, string> = {
  EXTENSION: '내선',
  QUEUE: '호 분배룰',
  EXTERNAL_NUMBER: '외부 번호',
};

function buildInitialValues(next: MappingResponse | null): BranchOperationFormValue {
  return {
    agentIds: next?.assignedAgentIds ?? [],
    queueIds: next?.assignedQueueIds ?? [],
    didIds: next?.assignedDidIds ?? [],
    routingEnabled: next?.settingsProfile?.routing?.enabled ?? true,
    forwardingEnabled: next?.settingsProfile?.forwarding?.enabled ?? false,
    forwardingRuleIds: next?.settingsProfile?.forwarding?.ids ?? [],
    promptsEnabled: next?.settingsProfile?.prompts?.enabled ?? false,
    promptIds: next?.settingsProfile?.prompts?.ids ?? [],
    smartArsEnabled: next?.settingsProfile?.smartArs?.enabled ?? false,
    recordingEnabled: next?.settingsProfile?.recording?.enabled ?? next?.defaultSystemRecordingEnabled ?? true,
    blocklist080Enabled: next?.settingsProfile?.blocklist080?.enabled ?? false,
    cidEnabled: next?.settingsProfile?.cid?.enabled ?? false,
    defaultOutboundCallerId:
      next?.settingsProfile?.cid?.defaultOutboundCallerId ?? next?.defaultSystemCallerId ?? undefined,
    smdrEnabled: next?.settingsProfile?.smdr?.enabled ?? false,
  };
}

function featureStatusTag(enabled: boolean) {
  return <Tag color={enabled ? 'green' : 'default'}>{enabled ? '사용' : '미사용'}</Tag>;
}

export function BranchMappingsModal({ open, branch, onClose, onSaved }: Props) {
  const [form] = Form.useForm<BranchOperationFormValue>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<MappingResponse | null>(null);
  const navigate = useNavigate();

  const routingEnabled = Form.useWatch('routingEnabled', form) ?? true;
  const forwardingEnabled = Form.useWatch('forwardingEnabled', form) ?? false;
  const promptsEnabled = Form.useWatch('promptsEnabled', form) ?? false;
  const smartArsEnabled = Form.useWatch('smartArsEnabled', form) ?? false;
  const cidEnabled = Form.useWatch('cidEnabled', form) ?? false;
  const recordingEnabled = Form.useWatch('recordingEnabled', form) ?? true;
  const blocklist080Enabled = Form.useWatch('blocklist080Enabled', form) ?? false;
  const smdrEnabled = Form.useWatch('smdrEnabled', form) ?? false;

  useEffect(() => {
    if (!open || !branch) return;

    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/admin/settings/branches/${branch.branchId}/mappings`);
        const next = (res.data?.data ?? null) as MappingResponse | null;
        setData(next);
        form.setFieldsValue(buildInitialValues(next));
      } catch {
        setData(null);
        message.error('지사 운영 설정 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open, branch?.branchId, form]);

  const agentOptions = useMemo(
    () =>
      (data?.availableAgents ?? []).map((agent) => ({
        value: agent.agentId,
        label: `${agent.agentName} (${agent.extension}, ${agent.role})`,
      })),
    [data?.availableAgents],
  );

  const queueOptions = useMemo(
    () =>
      (data?.availableQueues ?? []).map((queue) => ({
        value: queue.queueId,
        label: queue.queueDisplayName || queue.queueName,
      })),
    [data?.availableQueues],
  );

  const didOptions = useMemo(
    () =>
      (data?.availableDids ?? []).map((did) => ({
        value: did.id,
        label: did.description ? `${formatPhoneNumber(did.did)} (${did.description})` : formatPhoneNumber(did.did),
      })),
    [data?.availableDids],
  );

  const forwardingOptions = useMemo(
    () =>
      (data?.availableForwardingRules ?? []).map((rule) => ({
        value: rule.id,
        label: `${formatPhoneNumber(rule.did.did)} → ${FORWARD_TYPE_LABEL[rule.forwardType] ?? rule.forwardType} ${rule.forwardType === 'EXTERNAL_NUMBER' ? formatPhoneNumber(rule.targetValue) : rule.targetValue}${
          rule.conditionType === 'TIME_RANGE' ? ' (조건형)' : ''
        }`,
      })),
    [data?.availableForwardingRules],
  );

  const promptOptions = useMemo(
    () =>
      (data?.availablePrompts ?? []).map((prompt) => ({
        value: prompt.id,
        label: `${prompt.displayName} [${prompt.category}]`,
      })),
    [data?.availablePrompts],
  );

  const callerIdOptions = useMemo(
    () => (data?.availableCallerIds ?? []).map((callerId) => ({ value: callerId, label: formatPhoneNumber(callerId) })),
    [data?.availableCallerIds],
  );

  const moveTo = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal
      title={branch ? `지사 운영 설정: ${branch.branchName}` : '지사 운영 설정'}
      open={open}
      onCancel={onClose}
      onOk={async () => {
        if (!branch) return;
        const values = await form.validateFields();
        if (smartArsEnabled && values.blocklist080Enabled) {
          message.warning('스마트 ARS와 080 수신거부는 같은 지사에서 동시에 사용할 수 없습니다.');
          return;
        }
        setSaving(true);
        try {
          await apiClient.post(`/admin/settings/branches/${branch.branchId}/mappings`, {
            agentIds: values.agentIds,
            queueIds: values.queueIds,
            didIds: values.didIds,
            settingsProfile: {
              routing: {
                enabled: values.routingEnabled,
              },
              forwarding: {
                enabled: values.forwardingEnabled,
                ids: values.forwardingRuleIds ?? [],
              },
              prompts: {
                enabled: values.promptsEnabled,
                ids: values.promptIds ?? [],
              },
              recording: {
                enabled: values.recordingEnabled,
              },
              blocklist080: {
                enabled: values.blocklist080Enabled,
              },
              cid: {
                enabled: values.cidEnabled,
                defaultOutboundCallerId: values.cidEnabled ? values.defaultOutboundCallerId ?? null : null,
              },
              smdr: {
                enabled: values.smdrEnabled,
              },
            },
          });
          message.success('지사 운영 설정을 저장했습니다.');
          onSaved();
          onClose();
        } catch (error: any) {
          message.error(error?.response?.data?.error?.message ?? '지사 운영 설정 저장에 실패했습니다.');
        } finally {
          setSaving(false);
        }
      }}
      confirmLoading={saving}
      destroyOnClose
      width={1080}
    >
      {branch ? (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Alert
            type="info"
            showIcon
            message="세부 항목 등록/수정/삭제는 각 관리 메뉴에서 처리하고, 여기서는 지사에서 실제로 사용할 항목과 사용 여부만 결정합니다."
          />
          <Form form={form} layout="vertical" disabled={loading}>
            <Row gutter={16} align="stretch">
              <Col xs={24} lg={11}>
                <Card
                  title="기본 연결"
                  extra={
                    <Button type="link" size="small" onClick={() => moveTo('/settings/agents')}>
                      상담원 관리
                    </Button>
                  }
                >
                  <Form.Item label="소속 상담원" name="agentIds">
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      maxTagCount="responsive"
                      placeholder="지사에 속한 상담원을 선택하세요"
                      options={agentOptions}
                    />
                  </Form.Item>
                  <Form.Item
                    label="인입 DID"
                    name="didIds"
                    extra="지사에서 사용하는 대표번호와 DID를 연결합니다."
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      maxTagCount="responsive"
                      placeholder="지사에 연결할 DID를 선택하세요"
                      options={didOptions}
                    />
                  </Form.Item>
                </Card>
              </Col>
              <Col xs={24} lg={13}>
                <Card title="현재 운영 상태">
                  <Space wrap size={[8, 8]}>
                    {featureStatusTag(routingEnabled)}
                    <Typography.Text>호 분배룰</Typography.Text>
                    {featureStatusTag(forwardingEnabled)}
                    <Typography.Text>착신전환</Typography.Text>
                    {featureStatusTag(promptsEnabled)}
                    <Typography.Text>멘트</Typography.Text>
                    {featureStatusTag(smartArsEnabled)}
                    <Typography.Text>스마트 ARS</Typography.Text>
                    {featureStatusTag(recordingEnabled)}
                    <Typography.Text>녹취</Typography.Text>
                    {featureStatusTag(blocklist080Enabled)}
                    <Typography.Text>080 수신거부</Typography.Text>
                    {featureStatusTag(cidEnabled)}
                    <Typography.Text>CID</Typography.Text>
                    {featureStatusTag(smdrEnabled)}
                    <Typography.Text>SMDR</Typography.Text>
                  </Space>
                  <div style={{ marginTop: 12 }}>
                    <Typography.Text type="secondary">
                      운영 설정의 기준은 지사입니다. 각 기능은 여기서 켜고, 상세 항목은 별도 관리 메뉴에서 준비한 뒤 연결합니다.
                    </Typography.Text>
                  </div>
                </Card>
              </Col>
            </Row>
            <Collapse
              defaultActiveKey={['routing', 'forwarding', 'prompts']}
              items={[
                {
                  key: 'routing',
                  label: (
                    <Space>
                      <Typography.Text strong>호 분배룰 설정</Typography.Text>
                      {featureStatusTag(routingEnabled)}
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Form.Item name="routingEnabled" valuePropName="checked" noStyle>
                          <Switch checkedChildren="사용" unCheckedChildren="미사용" />
                        </Form.Item>
                        <Button type="link" size="small" onClick={() => moveTo('/settings/queues')}>
                          호 분배룰 관리
                        </Button>
                      </Space>
                      <Form.Item
                        label="사용할 호 분배룰"
                        name="queueIds"
                        extra="세부 분배 전략은 호 분배룰 설정 메뉴에서 관리하고, 지사에서는 사용할 큐만 선택합니다."
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          showSearch
                          maxTagCount="responsive"
                          disabled={!routingEnabled}
                          placeholder="지사에서 사용할 큐를 선택하세요"
                          options={queueOptions}
                        />
                      </Form.Item>
                    </Space>
                  ),
                },
                {
                  key: 'forwarding',
                  label: (
                    <Space>
                      <Typography.Text strong>착신전환 설정</Typography.Text>
                      {featureStatusTag(forwardingEnabled)}
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Form.Item name="forwardingEnabled" valuePropName="checked" noStyle>
                          <Switch checkedChildren="사용" unCheckedChildren="미사용" />
                        </Form.Item>
                        <Button type="link" size="small" onClick={() => moveTo('/settings/forwarding')}>
                          착신전환 규칙 관리
                        </Button>
                      </Space>
                      <Form.Item
                        label="적용할 착신전환 규칙"
                        name="forwardingRuleIds"
                        extra="DID별 규칙을 미리 등록한 뒤, 지사에서 실제 사용할 규칙만 연결합니다."
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          showSearch
                          maxTagCount="responsive"
                          disabled={!forwardingEnabled}
                          placeholder="사용할 착신전환 규칙을 선택하세요"
                          options={forwardingOptions}
                        />
                      </Form.Item>
                    </Space>
                  ),
                },
                {
                  key: 'prompts',
                  label: (
                    <Space>
                      <Typography.Text strong>멘트 사용 설정</Typography.Text>
                      {featureStatusTag(promptsEnabled)}
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Form.Item name="promptsEnabled" valuePropName="checked" noStyle>
                          <Switch checkedChildren="사용" unCheckedChildren="미사용" />
                        </Form.Item>
                        <Button type="link" size="small" onClick={() => moveTo('/settings/prompts')}>
                          멘트 관리
                        </Button>
                      </Space>
                      <Form.Item
                        label="사용할 멘트"
                        name="promptIds"
                        extra="지사에서 쓰는 대기/안내 멘트만 선택합니다."
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          showSearch
                          maxTagCount="responsive"
                          disabled={!promptsEnabled}
                          placeholder="사용할 멘트를 선택하세요"
                          options={promptOptions}
                        />
                      </Form.Item>
                    </Space>
                  ),
                },
                {
                  key: 'smartArs',
                  label: (
                    <Space>
                      <Typography.Text strong>스마트 ARS 설정</Typography.Text>
                      {featureStatusTag(smartArsEnabled)}
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        {featureStatusTag(smartArsEnabled)}
                        <Button type="link" size="small" onClick={() => moveTo('/settings/branches')}>
                          지사 설정 수정
                        </Button>
                      </Space>
                      <Typography.Text type="secondary">
                        스마트 ARS의 안내 멘트, 입력 대기, 재시도, DTMF 동작은 지사 설정 수정 화면에서 관리합니다.
                      </Typography.Text>
                    </Space>
                  ),
                },
                {
                  key: 'recording',
                  label: (
                    <Space>
                      <Typography.Text strong>녹취 설정</Typography.Text>
                      {featureStatusTag(recordingEnabled)}
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Form.Item name="recordingEnabled" valuePropName="checked" noStyle>
                          <Switch checkedChildren="사용" unCheckedChildren="미사용" />
                        </Form.Item>
                        <Button type="link" size="small" onClick={() => moveTo('/system')}>
                          시스템 설정
                        </Button>
                      </Space>
                      <Typography.Text type="secondary">
                        녹취 저장 정책과 기본 동작은 시스템 설정에서 관리하고, 지사에서는 사용 여부만 결정합니다.
                      </Typography.Text>
                    </Space>
                  ),
                },
                {
                  key: 'blocklist',
                  label: (
                    <Space>
                      <Typography.Text strong>080 수신거부 설정</Typography.Text>
                      {featureStatusTag(blocklist080Enabled)}
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Form.Item name="blocklist080Enabled" valuePropName="checked" noStyle>
                          <Switch checkedChildren="사용" unCheckedChildren="미사용" />
                        </Form.Item>
                        <Button type="link" size="small" onClick={() => moveTo('/blocklist')}>
                          080 수신거부 관리
                        </Button>
                      </Space>
                      <Typography.Text type="secondary">
                        차단 번호 등록과 관리 작업은 080 수신거부 메뉴에서 처리합니다.
                      </Typography.Text>
                    </Space>
                  ),
                },
                {
                  key: 'cid',
                  label: (
                    <Space>
                      <Typography.Text strong>CID / SMDR 설정</Typography.Text>
                      {featureStatusTag(cidEnabled || smdrEnabled)}
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Space size={16}>
                          <Form.Item name="cidEnabled" valuePropName="checked" noStyle>
                            <Switch checkedChildren="CID 사용" unCheckedChildren="CID 미사용" />
                          </Form.Item>
                          <Form.Item name="smdrEnabled" valuePropName="checked" noStyle>
                            <Switch checkedChildren="SMDR 사용" unCheckedChildren="SMDR 미사용" />
                          </Form.Item>
                        </Space>
                        <Button type="link" size="small" onClick={() => moveTo('/system')}>
                          시스템 설정
                        </Button>
                      </Space>
                      <Form.Item
                        label="지사 기본 발신번호"
                        name="defaultOutboundCallerId"
                        extra="허용 발신번호는 시스템 설정에서 관리하고, 지사에서는 사용할 기본 CID만 선택합니다."
                      >
                        <Select
                          allowClear
                          disabled={!cidEnabled}
                          placeholder="지사 기본 발신번호를 선택하세요"
                          options={callerIdOptions}
                        />
                      </Form.Item>
                      <Typography.Text type="secondary">
                        SMDR 외부 알림의 세부 연동 규격은 후속 시스템 설정 확장 대상입니다. 현재는 지사별 사용 여부만 보관합니다.
                      </Typography.Text>
                    </Space>
                  ),
                },
              ]}
            />
          </Form>
        </Space>
      ) : null}
    </Modal>
  );
}
