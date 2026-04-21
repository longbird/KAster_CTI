import { ApartmentOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../shared/lib/apiClient';
import {
  getForwardingRules,
  getIvrMenus,
  getPrompts,
} from '../asterisk-config/api/asteriskConfigApi';

export interface BranchRow {
  branchId: string;
  branchCode: string;
  branchName: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  agentCount?: number;
  queueCount?: number;
  didCount?: number;
  settingsProfile?: {
    routing?: { enabled: boolean };
    forwarding?: { enabled: boolean; ids?: string[] };
    prompts?: { enabled: boolean; ids?: string[]; queueJoinDelaySeconds?: number; waitForPlaybackCompletionBeforeQueue?: boolean };
    ars?: { enabled: boolean; ids?: string[] };
    recording?: { enabled: boolean };
    blocklist080?: { enabled: boolean };
    cid?: { enabled: boolean; defaultOutboundCallerId?: string | null };
    smdr?: { enabled: boolean };
  } | null;
  settingsSummary?: Array<{
    key: string;
    label: string;
    enabled: boolean;
  }>;
}

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string | null;
}

interface DidOption {
  id: string;
  did: string;
  description?: string | null;
}

interface PromptOption {
  id: string;
  displayName: string;
  promptKey: string;
  category: string;
}

interface IvrMenuOption {
  id: string;
  name: string;
  timeoutSecs: number;
}

interface ForwardingRuleOption {
  id: string;
  forwardType: 'EXTENSION' | 'QUEUE' | 'EXTERNAL_NUMBER';
  targetValue: string;
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  did: {
    id: string;
    did: string;
    description?: string | null;
  };
}

interface BranchSettingsProfile {
  routing?: {
    enabled: boolean;
    representativeDidId?: string | null;
    rules?: RoutingRuleFormValue[];
  };
  forwarding?: { enabled: boolean; ids?: string[] };
  prompts?: { enabled: boolean; ids?: string[]; queueJoinDelaySeconds?: number; waitForPlaybackCompletionBeforeQueue?: boolean };
  ars?: { enabled: boolean; ids?: string[] };
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
  assignedQueueIds: string[];
  assignedDidIds: string[];
  settingsProfile?: BranchSettingsProfile;
  availableQueues: QueueOption[];
  availableDids: DidOption[];
  availablePrompts: PromptOption[];
  availableIvrMenus: IvrMenuOption[];
  availableForwardingRules: ForwardingRuleOption[];
  availableCallerIds: string[];
  defaultSystemRecordingEnabled: boolean;
  defaultSystemCallerId: string | null;
}

interface BranchConfigFormValue {
  branchCode: string;
  branchName: string;
  description?: string;
  isActive: boolean;
  queueIds: string[];
  didIds: string[];
  representativeDidId?: string;
  routingEnabled: boolean;
  routingRules: RoutingRuleFormValue[];
  forwardingEnabled: boolean;
  forwardingRuleIds: string[];
  promptsEnabled: boolean;
  defaultPromptId?: string;
  promptQueueJoinDelaySeconds: number;
  waitForPromptCompletionBeforeQueue: boolean;
  arsEnabled: boolean;
  ivrMenuIds: string[];
  recordingEnabled: boolean;
  blocklist080Enabled: boolean;
  cidSmdrEnabled: boolean;
  defaultOutboundCallerId?: string;
}

interface Props {
  open: boolean;
  branch?: BranchRow | null;
  onClose: () => void;
  onSaved: () => void;
}

type RoutingConditionType = 'ALWAYS' | 'TIME_RANGE';
type WeekdayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface RoutingRuleFormValue {
  queueId: string;
  conditionType: RoutingConditionType;
  timeStart?: string;
  timeEnd?: string;
  daysOfWeek: WeekdayCode[];
}

const FORWARD_TYPE_LABEL: Record<string, string> = {
  EXTENSION: '내선',
  QUEUE: '호 분배룰',
  EXTERNAL_NUMBER: '외부 번호',
};

const WEEKDAY_OPTIONS: Array<{ value: WeekdayCode; label: string }> = [
  { value: 'mon', label: '월' },
  { value: 'tue', label: '화' },
  { value: 'wed', label: '수' },
  { value: 'thu', label: '목' },
  { value: 'fri', label: '금' },
  { value: 'sat', label: '토' },
  { value: 'sun', label: '일' },
];

const TIME_TEXT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function featureStatusTag(enabled: boolean) {
  return <Tag color={enabled ? 'green' : 'default'}>{enabled ? '사용' : '미사용'}</Tag>;
}

function buildDefaultRoutingRule(queueId: string, conditionType: RoutingConditionType = 'ALWAYS'): RoutingRuleFormValue {
  return {
    queueId,
    conditionType,
    timeStart: undefined,
    timeEnd: undefined,
    daysOfWeek: [],
  };
}

function normalizeRoutingRulesForForm(
  queueIds: string[],
  rules?: RoutingRuleFormValue[],
): RoutingRuleFormValue[] {
  const ruleMap = new Map((rules ?? []).map((rule) => [rule.queueId, rule]));

  return queueIds.map((queueId, index) => {
    const existing = ruleMap.get(queueId);
    if (existing) {
      return {
        queueId,
        conditionType: existing.conditionType === 'TIME_RANGE' ? 'TIME_RANGE' : 'ALWAYS',
        timeStart: existing.timeStart ?? undefined,
        timeEnd: existing.timeEnd ?? undefined,
        daysOfWeek: existing.daysOfWeek ?? [],
      };
    }

    return buildDefaultRoutingRule(queueId, index === 0 ? 'ALWAYS' : 'TIME_RANGE');
  });
}

function buildCreateDefaults(): BranchConfigFormValue {
  return {
    branchCode: '',
    branchName: '',
    description: '',
    isActive: true,
    queueIds: [],
    didIds: [],
    representativeDidId: undefined,
    routingEnabled: true,
    routingRules: [],
    forwardingEnabled: false,
    forwardingRuleIds: [],
    promptsEnabled: true,
    defaultPromptId: undefined,
    promptQueueJoinDelaySeconds: 0,
    waitForPromptCompletionBeforeQueue: false,
    arsEnabled: false,
    ivrMenuIds: [],
    recordingEnabled: true,
    blocklist080Enabled: false,
    cidSmdrEnabled: false,
    defaultOutboundCallerId: undefined,
  };
}

function buildInitialValues(branch: BranchRow | null | undefined, mapping: MappingResponse | null): BranchConfigFormValue {
  const defaults = buildCreateDefaults();
  const didIds = mapping?.assignedDidIds ?? [];
  const queueIds = mapping?.assignedQueueIds ?? [];
  return {
    ...defaults,
    branchCode: mapping?.branch?.branchCode ?? branch?.branchCode ?? '',
    branchName: mapping?.branch?.branchName ?? branch?.branchName ?? '',
    description: mapping?.branch?.description ?? branch?.description ?? '',
    isActive: mapping?.branch?.isActive ?? branch?.isActive ?? true,
    queueIds,
    didIds,
    representativeDidId:
      mapping?.settingsProfile?.routing?.representativeDidId ??
      (didIds.length === 1 ? didIds[0] : undefined),
    routingEnabled: mapping?.settingsProfile?.routing?.enabled ?? true,
    routingRules: normalizeRoutingRulesForForm(queueIds, mapping?.settingsProfile?.routing?.rules),
    forwardingEnabled: mapping?.settingsProfile?.forwarding?.enabled ?? false,
    forwardingRuleIds: mapping?.settingsProfile?.forwarding?.ids ?? [],
    promptsEnabled: mapping?.settingsProfile?.prompts?.enabled ?? true,
    defaultPromptId: mapping?.settingsProfile?.prompts?.ids?.[0] ?? undefined,
    promptQueueJoinDelaySeconds: mapping?.settingsProfile?.prompts?.queueJoinDelaySeconds ?? 0,
    waitForPromptCompletionBeforeQueue:
      mapping?.settingsProfile?.prompts?.waitForPlaybackCompletionBeforeQueue ?? false,
    arsEnabled: mapping?.settingsProfile?.ars?.enabled ?? false,
    ivrMenuIds: mapping?.settingsProfile?.ars?.ids ?? [],
    recordingEnabled: mapping?.settingsProfile?.recording?.enabled ?? mapping?.defaultSystemRecordingEnabled ?? true,
    blocklist080Enabled: mapping?.settingsProfile?.blocklist080?.enabled ?? false,
    cidSmdrEnabled: (mapping?.settingsProfile?.cid?.enabled ?? false) || (mapping?.settingsProfile?.smdr?.enabled ?? false),
    defaultOutboundCallerId:
      mapping?.settingsProfile?.cid?.defaultOutboundCallerId ?? mapping?.defaultSystemCallerId ?? undefined,
  };
}

export function BranchEditModal({ open, branch, onClose, onSaved }: Props) {
  const [form] = Form.useForm<BranchConfigFormValue>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mappingData, setMappingData] = useState<MappingResponse | null>(null);
  const navigate = useNavigate();
  const isEdit = !!branch?.branchId;

  const routingEnabled = Form.useWatch('routingEnabled', form) ?? true;
  const selectedQueueIds = Form.useWatch('queueIds', form) ?? [];
  const selectedDidIds = Form.useWatch('didIds', form) ?? [];
  const routingRules = Form.useWatch('routingRules', form) ?? [];
  const forwardingEnabled = Form.useWatch('forwardingEnabled', form) ?? false;
  const promptsEnabled = Form.useWatch('promptsEnabled', form) ?? true;
  const arsEnabled = Form.useWatch('arsEnabled', form) ?? false;
  const recordingEnabled = Form.useWatch('recordingEnabled', form) ?? true;
  const blocklist080Enabled = Form.useWatch('blocklist080Enabled', form) ?? false;
  const cidSmdrEnabled = Form.useWatch('cidSmdrEnabled', form) ?? false;

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);
      try {
        if (branch?.branchId) {
          const res = await apiClient.get(`/admin/settings/branches/${branch.branchId}/mappings`);
          const next = (res.data?.data ?? null) as MappingResponse | null;
          setMappingData(next);
          form.setFieldsValue(buildInitialValues(branch, next));
          return;
        }

        const [queuesRes, didsRes, prompts, ivrMenus, forwardingRules, systemRes] = await Promise.all([
          apiClient.get('/queues'),
          apiClient.get('/asterisk-config/dids'),
          getPrompts(),
          getIvrMenus(),
          getForwardingRules(),
          apiClient.get('/admin/settings/system'),
        ]);

        const next: MappingResponse = {
          branch: null,
          assignedQueueIds: [],
          assignedDidIds: [],
          settingsProfile: undefined,
          availableQueues: (queuesRes.data?.data ?? []).filter((queue: QueueOption & { isActive?: boolean }) => (queue as any).isActive !== false),
          availableDids: (didsRes.data?.data ?? []).filter((did: DidOption & { enabled?: boolean }) => did.enabled !== false),
          availablePrompts: prompts.filter((prompt) => prompt.isActive !== false),
          availableIvrMenus: ivrMenus,
          availableForwardingRules: forwardingRules.filter((rule) => rule.enabled !== false),
          availableCallerIds: String(systemRes.data?.data?.allowedOutboundCallerIds ?? '')
            .split(/\r?\n|,/)
            .map((item: string) => item.trim())
            .filter(Boolean),
          defaultSystemRecordingEnabled: systemRes.data?.data?.recordingEnabled ?? true,
          defaultSystemCallerId: systemRes.data?.data?.defaultOutboundCallerId ?? null,
        };
        setMappingData(next);
        form.setFieldsValue(buildInitialValues(branch, next));
      } catch (error: any) {
        setMappingData(null);
        message.error(error?.response?.data?.error?.message ?? '지사 설정 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open, branch?.branchId, form]);

  useEffect(() => {
    const nextRules = normalizeRoutingRulesForForm(selectedQueueIds, routingRules);
    if (JSON.stringify(nextRules) !== JSON.stringify(routingRules)) {
      form.setFieldValue('routingRules', nextRules);
    }
  }, [form, routingRules, selectedQueueIds]);

  useEffect(() => {
    const currentRepresentativeDidId = form.getFieldValue('representativeDidId') as string | undefined;
    if (currentRepresentativeDidId && selectedDidIds.includes(currentRepresentativeDidId)) {
      return;
    }

    form.setFieldValue(
      'representativeDidId',
      selectedDidIds.length === 1 ? selectedDidIds[0] : undefined,
    );
  }, [form, selectedDidIds]);

  const queueOptions = useMemo(
    () =>
      (mappingData?.availableQueues ?? []).map((queue) => ({
        value: queue.queueId,
        label: queue.queueDisplayName || queue.queueName,
      })),
    [mappingData?.availableQueues],
  );

  const queueLabelById = useMemo(
    () =>
      Object.fromEntries(
        (mappingData?.availableQueues ?? []).map((queue) => [queue.queueId, queue.queueDisplayName || queue.queueName]),
      ) as Record<string, string>,
    [mappingData?.availableQueues],
  );

  const didOptions = useMemo(
    () =>
      (mappingData?.availableDids ?? []).map((did) => ({
        value: did.id,
        label: did.description ? `${did.did} (${did.description})` : did.did,
      })),
    [mappingData?.availableDids],
  );

  const representativeDidOptions = useMemo(
    () => didOptions.filter((option) => selectedDidIds.includes(String(option.value))),
    [didOptions, selectedDidIds],
  );

  const promptOptions = useMemo(
    () =>
      (mappingData?.availablePrompts ?? []).map((prompt) => ({
        value: prompt.id,
        label: `${prompt.displayName} [${prompt.category}]`,
      })),
    [mappingData?.availablePrompts],
  );

  const ivrMenuOptions = useMemo(
    () =>
      (mappingData?.availableIvrMenus ?? []).map((menu) => ({
        value: menu.id,
        label: `${menu.name} (${menu.timeoutSecs}초)`,
      })),
    [mappingData?.availableIvrMenus],
  );

  const forwardingOptions = useMemo(
    () =>
      (mappingData?.availableForwardingRules ?? []).map((rule) => ({
        value: rule.id,
        label: `${rule.did.did} → ${FORWARD_TYPE_LABEL[rule.forwardType] ?? rule.forwardType} ${rule.targetValue}${
          rule.conditionType === 'TIME_RANGE' ? ' (조건형)' : ''
        }`,
      })),
    [mappingData?.availableForwardingRules],
  );

  const callerIdOptions = useMemo(
    () => (mappingData?.availableCallerIds ?? []).map((callerId) => ({ value: callerId, label: callerId })),
    [mappingData?.availableCallerIds],
  );

  const sectionSwitch = (fieldName: keyof BranchConfigFormValue, checkedChildren = '사용', unCheckedChildren = '미사용') => (
    <Form.Item name={fieldName} valuePropName="checked" noStyle>
      <Switch
        checkedChildren={checkedChildren}
        unCheckedChildren={unCheckedChildren}
        onClick={(_, event) => {
          event?.stopPropagation();
        }}
      />
    </Form.Item>
  );

  const moveTo = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal
      title={isEdit ? '지사 설정 수정' : '지사 등록'}
      open={open}
      destroyOnClose
      className="branch-edit-modal"
      onCancel={onClose}
      confirmLoading={saving}
      okText={isEdit ? '저장' : '등록'}
      cancelText="닫기"
      width={1120}
      onOk={async () => {
        const values = await form.validateFields();
        if ((values.didIds ?? []).length === 0) {
          message.warning('지사 기본 정보에는 최소 1개의 DID 연결이 필요합니다.');
          return;
        }
        if (!values.representativeDidId) {
          message.warning('지사 대표번호는 반드시 1개 선택해야 합니다.');
          return;
        }
        if (!(values.didIds ?? []).includes(values.representativeDidId)) {
          message.warning('대표번호는 연결된 DID 중에서 선택해야 합니다.');
          return;
        }
        if (!values.promptsEnabled || !values.defaultPromptId) {
          message.warning('고객 안내를 위해 기본 멘트는 필수입니다.');
          return;
        }

        const normalizedRoutingRules = normalizeRoutingRulesForForm(values.queueIds ?? [], values.routingRules ?? []);
        const alwaysCount = normalizedRoutingRules.filter((rule) => rule.conditionType === 'ALWAYS').length;

        if ((values.queueIds ?? []).length > 1 && normalizedRoutingRules.length !== (values.queueIds ?? []).length) {
          message.warning('호 분배룰을 여러 개 선택한 경우 각 룰의 작동 조건을 모두 설정해야 합니다.');
          return;
        }
        if (alwaysCount > 1) {
          message.warning('상시 적용 호 분배룰은 1개만 설정할 수 있습니다.');
          return;
        }
        for (const rule of normalizedRoutingRules) {
          if (rule.conditionType !== 'TIME_RANGE') continue;

          if (!rule.timeStart || !rule.timeEnd || (rule.daysOfWeek ?? []).length === 0) {
            message.warning('조건형 호 분배룰에는 요일과 시작/종료 시간을 모두 설정해야 합니다.');
            return;
          }
          if (!TIME_TEXT_PATTERN.test(rule.timeStart) || !TIME_TEXT_PATTERN.test(rule.timeEnd)) {
            message.warning('호 분배룰 시간은 HH:mm 형식으로 입력해야 합니다.');
            return;
          }
          if (rule.timeStart >= rule.timeEnd) {
            message.warning('호 분배룰 종료 시간은 시작 시간보다 늦어야 합니다.');
            return;
          }
        }

        setSaving(true);
        try {
          let branchId = branch?.branchId;

          const branchPayload = {
            branchCode: values.branchCode,
            branchName: values.branchName,
            description: values.description ?? '',
            isActive: values.isActive,
          };

          if (branchId) {
            await apiClient.post(`/admin/settings/branches/${branchId}`, branchPayload);
          } else {
            const createRes = await apiClient.post('/admin/settings/branches', branchPayload);
            branchId = createRes.data?.data?.branchId;
          }

          if (!branchId) {
            throw new Error('branchId_missing');
          }

          await apiClient.post(`/admin/settings/branches/${branchId}/mappings`, {
            agentIds: [],
            queueIds: values.queueIds,
            didIds: values.didIds,
            settingsProfile: {
              routing: {
                enabled: values.routingEnabled,
                representativeDidId: values.representativeDidId,
                rules: normalizedRoutingRules,
              },
              forwarding: {
                enabled: values.forwardingEnabled,
                ids: values.forwardingRuleIds ?? [],
              },
              prompts: {
                enabled: values.promptsEnabled,
                ids: values.defaultPromptId ? [values.defaultPromptId] : [],
                queueJoinDelaySeconds: values.promptQueueJoinDelaySeconds ?? 0,
                waitForPlaybackCompletionBeforeQueue: values.waitForPromptCompletionBeforeQueue ?? false,
              },
              ars: {
                enabled: values.arsEnabled,
                ids: values.ivrMenuIds ?? [],
              },
              recording: {
                enabled: values.recordingEnabled,
              },
              blocklist080: {
                enabled: values.blocklist080Enabled,
              },
              cid: {
                enabled: values.cidSmdrEnabled,
                defaultOutboundCallerId: values.cidSmdrEnabled ? values.defaultOutboundCallerId ?? null : null,
              },
              smdr: {
                enabled: values.cidSmdrEnabled,
              },
            },
          });

          message.success(isEdit ? '지사 설정을 저장했습니다.' : '지사를 등록했습니다.');
          onSaved();
          onClose();
        } catch (error: any) {
          message.error(error?.response?.data?.error?.message ?? `지사 ${isEdit ? '저장' : '등록'}에 실패했습니다.`);
        } finally {
          setSaving(false);
        }
      }}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setMappingData(null);
          form.resetFields();
        }
      }}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="branch-edit-modal__hero">
          <Space align="start" size={12}>
            <div className="branch-edit-modal__hero-icon">
              <ApartmentOutlined />
            </div>
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                지사 등록과 운영 설정을 한 화면에서 처리합니다.
              </Typography.Title>
              <Typography.Text type="secondary">
                DID 연결을 포함한 지사 기본값과 실제 사용할 운영 기능을 한 번에 저장합니다.
              </Typography.Text>
            </div>
          </Space>
          <Tag color={isEdit ? 'blue' : 'green'}>{isEdit ? '지사 설정 수정' : '신규 지사 등록'}</Tag>
        </div>

        <Alert
          type="info"
          showIcon
          message="지사별로 사용할 DID, 호 분배룰, 착신전환, 멘트, ARS, 녹취, 080, CID/SMDR를 여기서 함께 결정합니다."
        />

        <Form form={form} layout="vertical" disabled={loading} className="branch-edit-modal__form">
          <Row gutter={16} align="stretch">
            <Col xs={24} lg={16}>
              <Card className="branch-edit-modal__panel" title="지사 기본 정보">
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label="지사 코드"
                      name="branchCode"
                      extra="운영에서 지사를 식별하는 고유 코드입니다."
                      rules={[{ required: true, message: '지사 코드를 입력하세요' }]}
                    >
                      <Input maxLength={32} placeholder="예: j00011" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label="지사명"
                      name="branchName"
                      extra="목록과 운영 화면에 표시되는 지사명입니다."
                      rules={[{ required: true, message: '지사명을 입력하세요' }]}
                    >
                      <Input maxLength={128} placeholder="예: 강남지사" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col xs={24} lg={14}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label="연결 DID"
                      name="didIds"
                      extra="지사에서 사용할 DID를 연결합니다. 대표번호는 아래에서 1개만 선택합니다."
                      rules={[{ required: true, message: '지사에 연결할 DID를 선택하세요.' }]}
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
                  </Col>
                  <Col xs={24} lg={10}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label="대표번호"
                      name="representativeDidId"
                      extra="연결 DID 중 1개만 지정합니다."
                      rules={[{ required: true, message: '대표번호를 선택하세요.' }]}
                    >
                      <Select
                        allowClear
                        showSearch
                        placeholder="대표번호를 선택하세요"
                        options={representativeDidOptions}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="설명" name="description" extra="지사 역할이나 운영 메모를 남길 수 있습니다.">
                  <Input.TextArea rows={4} maxLength={1000} placeholder="예: 서울 남부권 대표 인입 지사" />
                </Form.Item>
                <Form.Item className="branch-edit-modal__compact-item" label="활성 여부" name="isActive" valuePropName="checked">
                  <Switch checkedChildren="활성" unCheckedChildren="비활성" />
                </Form.Item>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card className="branch-edit-modal__panel" title="현재 운영 상태">
                <Space wrap size={[8, 8]}>
                  {featureStatusTag(routingEnabled)}
                  <Typography.Text>호 분배룰</Typography.Text>
                  {featureStatusTag(forwardingEnabled)}
                  <Typography.Text>착신전환</Typography.Text>
                  {featureStatusTag(promptsEnabled)}
                  <Typography.Text>기본 멘트</Typography.Text>
                  {featureStatusTag(arsEnabled)}
                  <Typography.Text>ARS</Typography.Text>
                  {featureStatusTag(recordingEnabled)}
                  <Typography.Text>녹취</Typography.Text>
                  {featureStatusTag(blocklist080Enabled)}
                  <Typography.Text>080</Typography.Text>
                  {featureStatusTag(cidSmdrEnabled)}
                  <Typography.Text>CID/SMDR</Typography.Text>
                </Space>
                <div style={{ marginTop: 12 }}>
                  <Typography.Text type="secondary">
                    세부 항목 생성과 수정은 각 관리 메뉴에서 처리하고, 지사에서는 사용할 대상만 선택합니다.
                  </Typography.Text>
                </div>
              </Card>
            </Col>
          </Row>

          <Collapse
            style={{ marginTop: 16 }}
            defaultActiveKey={['routing', 'forwarding', 'prompts', 'ars']}
            items={[
              {
                key: 'routing',
                label: (
                  <Space>
                    <Typography.Text strong>호 분배룰 설정</Typography.Text>
                  </Space>
                ),
                extra: sectionSwitch('routingEnabled'),
                children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Typography.Text type="secondary">
                          여러 개의 호 분배룰을 쓰는 경우 각 룰의 작동 조건을 함께 설정합니다.
                        </Typography.Text>
                        <Button type="link" size="small" onClick={() => moveTo('/settings/queues')}>
                          호 분배룰 관리
                      </Button>
                    </Space>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label="사용할 호 분배룰"
                      name="queueIds"
                      extra="지사에서 사용하는 큐를 직접 선택합니다."
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
                    {selectedQueueIds.length > 1 ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="호 분배룰을 여러 개 선택한 경우 각 룰마다 상시 또는 요일/시간대 조건을 지정해야 합니다."
                      />
                    ) : null}
                    {selectedQueueIds.length > 0 ? (
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        {(normalizeRoutingRulesForForm(selectedQueueIds, routingRules) ?? []).map((rule, index) => {
                          const conditionType = routingRules[index]?.conditionType ?? rule.conditionType;

                          return (
                            <Card
                              key={rule.queueId}
                              size="small"
                              title={queueLabelById[rule.queueId] ?? rule.queueId}
                              extra={<Tag>{index === 0 ? '우선 검토' : '추가 룰'}</Tag>}
                            >
                              <Form.Item name={['routingRules', index, 'queueId']} hidden>
                                <Input />
                              </Form.Item>
                              <Row gutter={12}>
                                <Col xs={24} md={8}>
                                  <Form.Item className="branch-edit-modal__compact-item" label="작동 조건" name={['routingRules', index, 'conditionType']}>
                                    <Select
                                      disabled={!routingEnabled}
                                      options={[
                                        { value: 'ALWAYS', label: '상시 적용' },
                                        { value: 'TIME_RANGE', label: '요일/시간대 조건' },
                                      ]}
                                    />
                                  </Form.Item>
                                </Col>
                                {conditionType === 'TIME_RANGE' ? (
                                  <>
                                    <Col xs={24} md={8}>
                                      <Form.Item className="branch-edit-modal__compact-item" label="시작 시간" name={['routingRules', index, 'timeStart']}>
                                        <Input disabled={!routingEnabled} placeholder="09:00" maxLength={5} />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                      <Form.Item className="branch-edit-modal__compact-item" label="종료 시간" name={['routingRules', index, 'timeEnd']}>
                                        <Input disabled={!routingEnabled} placeholder="18:00" maxLength={5} />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24}>
                                      <Form.Item
                                        label="요일"
                                        name={['routingRules', index, 'daysOfWeek']}
                                        extra="예: 평일 주간은 월~금, 야간은 월~일처럼 선택합니다."
                                      >
                                        <Select
                                          mode="multiple"
                                          allowClear
                                          disabled={!routingEnabled}
                                          options={WEEKDAY_OPTIONS}
                                        />
                                      </Form.Item>
                                    </Col>
                                  </>
                                ) : (
                                  <Col xs={24} md={16}>
                                    <Alert
                                      type="info"
                                      showIcon
                                      message="이 호 분배룰은 조건 없이 상시 적용됩니다."
                                    />
                                  </Col>
                                )}
                              </Row>
                            </Card>
                          );
                        })}
                      </Space>
                    ) : null}
                  </Space>
                ),
              },
              {
                key: 'forwarding',
                label: (
                  <Space>
                    <Typography.Text strong>착신전환 설정</Typography.Text>
                  </Space>
                ),
                extra: sectionSwitch('forwardingEnabled'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                      <Typography.Text type="secondary">
                        세부 규칙은 착신전환 설정 메뉴에서 만들고 여기서 사용할 규칙만 고릅니다.
                      </Typography.Text>
                      <Button type="link" size="small" onClick={() => moveTo('/settings/forwarding')}>
                        착신전환 규칙 관리
                      </Button>
                    </Space>
                    <Form.Item className="branch-edit-modal__compact-item" label="적용할 착신전환 규칙" name="forwardingRuleIds">
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
                  </Space>
                ),
                extra: sectionSwitch('promptsEnabled'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                      <Typography.Text type="secondary">
                        고객 안내를 위해 기본 멘트는 필수입니다.
                      </Typography.Text>
                      <Button type="link" size="small" onClick={() => moveTo('/settings/prompts')}>
                        멘트 관리
                      </Button>
                    </Space>
                    <Row gutter={12}>
                      <Col xs={24} lg={18}>
                        <Form.Item
                          className="branch-edit-modal__compact-item"
                          label="기본 멘트"
                          name="defaultPromptId"
                          rules={[{ required: true, message: '기본 멘트를 선택하세요.' }]}
                          extra="기본값 0초는 멘트 시작과 동시에 큐 진입입니다."
                        >
                          <Select
                            allowClear
                            showSearch
                            disabled={!promptsEnabled}
                            placeholder="지사 기본 멘트를 선택하세요"
                            options={promptOptions}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} lg={6}>
                        <Form.Item
                          className="branch-edit-modal__compact-item"
                          label="지연(초)"
                          name="promptQueueJoinDelaySeconds"
                          extra="지정 초 후 큐 진입"
                        >
                          <InputNumber min={0} max={300} precision={0} style={{ width: '100%' }} disabled={!promptsEnabled} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label="멘트 완료까지 대기"
                      name="waitForPromptCompletionBeforeQueue"
                      valuePropName="checked"
                      extra="사용 시 멘트가 끝난 뒤에만 큐에 진입합니다. 끄면 멘트 시작과 동시에 또는 지정 초 후 큐에 진입합니다."
                    >
                      <Switch checkedChildren="완료 후" unCheckedChildren="병행 진입" disabled={!promptsEnabled} />
                    </Form.Item>
                  </Space>
                ),
              },
              {
                key: 'ars',
                label: (
                  <Space>
                    <Typography.Text strong>ARS 기능 설정</Typography.Text>
                  </Space>
                ),
                extra: sectionSwitch('arsEnabled'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                      <Typography.Text type="secondary">
                        지사에서 사용하는 IVR 메뉴만 선택합니다.
                      </Typography.Text>
                      <Button type="link" size="small" onClick={() => moveTo('/asterisk')}>
                        IVR 메뉴 관리
                      </Button>
                    </Space>
                    <Form.Item className="branch-edit-modal__compact-item" label="사용할 ARS 메뉴" name="ivrMenuIds">
                      <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        maxTagCount="responsive"
                        disabled={!arsEnabled}
                        placeholder="사용할 IVR 메뉴를 선택하세요"
                        options={ivrMenuOptions}
                      />
                    </Form.Item>
                  </Space>
                ),
              },
              {
                key: 'recording',
                label: (
                  <Space>
                    <Typography.Text strong>녹취 설정</Typography.Text>
                  </Space>
                ),
                extra: sectionSwitch('recordingEnabled'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                      <Typography.Text type="secondary">
                        녹취 저장 정책과 기본 동작은 시스템 설정에서 관리합니다.
                      </Typography.Text>
                      <Button type="link" size="small" onClick={() => moveTo('/system')}>
                        시스템 설정
                      </Button>
                    </Space>
                  </Space>
                ),
              },
              {
                key: 'blocklist',
                label: (
                  <Space>
                    <Typography.Text strong>080 수신거부 설정</Typography.Text>
                  </Space>
                ),
                extra: sectionSwitch('blocklist080Enabled'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                      <Typography.Text type="secondary">
                        차단 번호 자체는 080 수신거부 메뉴에서 관리합니다.
                      </Typography.Text>
                      <Button type="link" size="small" onClick={() => moveTo('/blocklist')}>
                        080 수신거부 관리
                      </Button>
                    </Space>
                    <Typography.Text type="secondary">
                      지사에서 080 수신거부 기능을 사용할지 여부만 여기서 결정합니다.
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                key: 'cid',
                label: (
                  <Space>
                    <Typography.Text strong>CID / SMDR 설정</Typography.Text>
                  </Space>
                ),
                extra: sectionSwitch('cidSmdrEnabled'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                      <Typography.Text type="secondary">
                        CID와 SMDR 외부 알림은 같은 조건으로 함께 동작합니다.
                      </Typography.Text>
                      <Button type="link" size="small" onClick={() => moveTo('/system')}>
                        시스템 설정
                      </Button>
                    </Space>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label="지사 기본 발신번호"
                      name="defaultOutboundCallerId"
                      extra="허용 발신번호는 시스템 설정에서 관리하고, 지사에서는 사용할 기본 CID만 선택합니다."
                    >
                      <Select
                        allowClear
                        disabled={!cidSmdrEnabled}
                        placeholder="지사 기본 발신번호를 선택하세요"
                        options={callerIdOptions}
                      />
                    </Form.Item>
                    <Typography.Text type="secondary">
                      SMDR 외부 알림 상세 규격은 후속 시스템 연동 확장 대상이며, 현재는 지사별 사용 여부를 우선 보관합니다.
                    </Typography.Text>
                  </Space>
                ),
              },
            ]}
          />
        </Form>
      </Space>
    </Modal>
  );
}
