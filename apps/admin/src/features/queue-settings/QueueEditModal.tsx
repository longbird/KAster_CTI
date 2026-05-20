import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { FeatureHelpButton } from '../../shared/help';
import { apiClient } from '../../shared/lib/apiClient';
import {
  DISTRIBUTION_MODE_OPTIONS,
  QUEUE_STRATEGY_OPTIONS,
  UNCONDITIONAL_TARGET_TYPE_OPTIONS,
} from './queueStrategy';

export interface QueueRow {
  queueId: string;
  queueName: string;
  queueExten: string;
  queueDisplayName?: string;
  distributionMode?: string;
  unconditionalTargetType?: 'AGENT' | 'QUEUE' | 'EXTERNAL_NUMBER' | null;
  unconditionalTargetValue?: string | null;
  strategy?: string;
  maxWaitSeconds?: number;
  ringTimeoutSeconds?: number;
  wrapupSeconds?: number;
  autopause?: boolean;
  isActive?: boolean;
  isDefaultRule?: boolean;
  routingReferenceCount?: number;
  canDeactivate?: boolean;
  deactivateBlockedReason?: string | null;
  routingReferences?: {
    directDidCount: number;
    forwardingRuleCount: number;
    ivrEntryCount: number;
    ivrMenuCount: number;
  };
}

interface Props {
  queue: QueueRow | null;
  canEditSettings: boolean;
  canEditMembers: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface MemberResponse {
  agentId: string;
  penalty: number;
  memberOrder: number;
  agent: {
    agentId: string;
    agentName: string;
    extension: string;
    loginId?: string;
    defaultQueueId?: string | null;
    isActive: boolean;
  };
}

interface AgentOption {
  agentId: string;
  agentName: string;
  extension: string;
  loginId: string;
  defaultQueueId?: string | null;
  isActive: boolean;
}

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
}

interface DraftMember {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  defaultQueueId?: string | null;
  penalty: number;
  memberOrder: number;
}

function getGroupLabel(agent: { defaultQueueId?: string | null }, queues: QueueOption[]) {
  const found = queues.find((item) => item.queueId === agent.defaultQueueId);
  return found?.queueDisplayName ?? found?.queueName ?? '미지정';
}

function renderSingleLine(text: string) {
  return (
    <Typography.Text
      style={{
        display: 'block',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      title={text}
    >
      {text}
    </Typography.Text>
  );
}

export function QueueEditModal({
  queue,
  canEditSettings,
  canEditMembers,
  onClose,
  onSaved,
}: Props) {
  const [form] = Form.useForm<{
    queueDisplayName?: string;
    distributionMode?: string;
    unconditionalTargetType?: 'AGENT' | 'QUEUE' | 'EXTERNAL_NUMBER';
    unconditionalTargetValue?: string;
    strategy?: string;
    maxWaitSeconds?: number;
    ringTimeoutSeconds?: number;
    wrapupSeconds?: number;
    autopause?: boolean;
  }>();
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [draftMembers, setDraftMembers] = useState<DraftMember[]>([]);
  const [selectedAvailableIds, setSelectedAvailableIds] = useState<string[]>([]);
  const [selectedAssignedIds, setSelectedAssignedIds] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<'ALL' | string>('ALL');
  const [searchText, setSearchText] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const distributionMode = Form.useWatch('distributionMode', form) ?? queue?.distributionMode ?? 'DISTRIBUTE';
  const unconditionalTargetType =
    Form.useWatch('unconditionalTargetType', form) ?? queue?.unconditionalTargetType ?? 'AGENT';

  const initialValues = queue
    ? {
        queueDisplayName: queue.queueDisplayName,
        distributionMode: queue.distributionMode ?? 'DISTRIBUTE',
        unconditionalTargetType: queue.unconditionalTargetType ?? 'AGENT',
        unconditionalTargetValue: queue.unconditionalTargetValue ?? undefined,
        strategy: queue.strategy,
        maxWaitSeconds: queue.maxWaitSeconds,
        ringTimeoutSeconds: queue.ringTimeoutSeconds,
        wrapupSeconds: queue.wrapupSeconds,
        autopause: queue.autopause,
      }
    : undefined;

  useEffect(() => {
    if (queue && initialValues) {
      form.resetFields();
      form.setFieldsValue(initialValues);
    } else {
      form.resetFields();
      setDraftMembers([]);
      setAllAgents([]);
      setQueues([]);
    }
  }, [queue, form, initialValues]);

  useEffect(() => {
    if (!queue) return;

    setSelectedAvailableIds([]);
    setSelectedAssignedIds([]);
    setGroupFilter('ALL');
    setSearchText('');
    setLoadingMembers(true);

    void Promise.all([
      apiClient.get(`/queues/${queue.queueId}/members`),
      apiClient.get('/agents'),
      apiClient.get('/queues'),
    ])
      .then(([membersRes, agentsRes, queuesRes]) => {
        const loadedMembers = membersRes.data?.data ?? [];
        const loadedAgents = (agentsRes.data?.data ?? []).filter((agent: AgentOption) => agent.isActive);
        const loadedQueues = queuesRes.data?.data ?? [];

        setDraftMembers(
          loadedMembers.map((item: MemberResponse, index: number) => ({
            agentId: item.agentId,
            agentName: item.agent.agentName,
            loginId: item.agent.loginId ?? '',
            extension: item.agent.extension,
            defaultQueueId: item.agent.defaultQueueId ?? null,
            penalty: item.penalty ?? 0,
            memberOrder: item.memberOrder ?? index,
          })),
        );
        setAllAgents(loadedAgents);
        setQueues(loadedQueues);
      })
      .catch((err: any) => {
        const msg = err?.response?.data?.error?.message ?? '분배 대상 조회 실패';
        message.error(msg);
      })
      .finally(() => setLoadingMembers(false));
  }, [queue]);

  const assignedIdSet = useMemo(() => new Set(draftMembers.map((item) => item.agentId)), [draftMembers]);

  const availableAgents = useMemo(
    () =>
      allAgents.filter((agent) => {
        if (assignedIdSet.has(agent.agentId)) return false;
        if (groupFilter !== 'ALL' && agent.defaultQueueId !== groupFilter) return false;
        const keyword = searchText.trim().toLowerCase();
        if (!keyword) return true;
        return [agent.agentName, agent.loginId, agent.extension, getGroupLabel(agent, queues)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      }),
    [allAgents, assignedIdSet, groupFilter, searchText, queues],
  );

  const groupOptions = useMemo(
    () => [
      { value: 'ALL', label: '전체' },
      ...queues.map((item) => ({
        value: item.queueId,
        label: item.queueDisplayName ?? item.queueName,
      })),
    ],
    [queues],
  );
  const unconditionalAgentOptions = useMemo(
    () =>
      allAgents.map((agent) => ({
        value: agent.agentId,
        label: `${agent.extension} · ${agent.agentName}`,
      })),
    [allAgents],
  );
  const unconditionalQueueOptions = useMemo(
    () =>
      queues
        .filter((item) => item.queueId !== queue?.queueId)
        .map((item) => ({
          value: item.queueId,
          label: item.queueDisplayName ?? item.queueName,
        })),
    [queues, queue?.queueId],
  );
  const availableTableScroll = availableAgents.length > 6 ? { y: 360 } : undefined;
  const draftTableScroll = draftMembers.length > 6 ? { y: 360 } : undefined;

  const addSelected = () => {
    if (selectedAvailableIds.length === 0) {
      message.warning('추가할 상담원을 선택하세요');
      return;
    }

    const picked = availableAgents.filter((agent) => selectedAvailableIds.includes(agent.agentId));
    setDraftMembers((prev) => [
      ...prev,
      ...picked.map((agent, index) => ({
        agentId: agent.agentId,
        agentName: agent.agentName,
        loginId: agent.loginId,
        extension: agent.extension,
        defaultQueueId: agent.defaultQueueId ?? null,
        penalty: 0,
        memberOrder: prev.length + index,
      })),
    ]);
    setSelectedAvailableIds([]);
  };

  const removeSelected = () => {
    if (selectedAssignedIds.length === 0) {
      message.warning('제외할 상담원을 선택하세요');
      return;
    }

    setDraftMembers((prev) =>
      prev
        .filter((item) => !selectedAssignedIds.includes(item.agentId))
        .map((item, index) => ({ ...item, memberOrder: index })),
    );
    setSelectedAssignedIds([]);
  };

  const moveMember = (agentId: string, direction: 'up' | 'down') => {
    setDraftMembers((prev) => {
      const index = prev.findIndex((item) => item.agentId === agentId);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next.map((item, order) => ({ ...item, memberOrder: order }));
    });
  };

  const handleOk = async () => {
    if (!queue) return;

    setSaving(true);
    try {
      const values = canEditSettings ? await form.validateFields() : {};
      await apiClient.patch(`/queues/${queue.queueId}`, {
        ...values,
        ...(canEditMembers
          ? {
              members: draftMembers.map((item, index) => ({
                agentId: item.agentId,
                penalty: item.penalty,
                memberOrder: index,
              })),
            }
          : {}),
      });
      message.success('저장 완료');
      onSaved();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '저장 실패';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        <Space align="center">
          <span>{`호 분배룰 수정 - ${queue?.queueDisplayName ?? queue?.queueName ?? ''}`}</span>
          <FeatureHelpButton featureKey="queue.externalInboundMode" featureName="외부 착신 방식" />
        </Space>
      }
      open={!!queue}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
      width={1240}
      confirmLoading={saving}
      okButtonProps={{ disabled: !canEditSettings && !canEditMembers }}
      destroyOnClose
      afterOpenChange={(open) => {
        if (!open || !queue || !initialValues) return;
        form.resetFields();
        form.setFieldsValue(initialValues);
      }}
    >
      <Form
        key={queue?.queueId ?? 'queue-edit'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
        onValuesChange={(changedValues) => {
          if ('distributionMode' in changedValues && changedValues.distributionMode !== 'UNCONDITIONAL') {
            form.setFieldValue('unconditionalTargetValue', undefined);
          }
          if ('unconditionalTargetType' in changedValues) {
            form.setFieldValue('unconditionalTargetValue', undefined);
          }
        }}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="기본 설정" size="small">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item label="Rule명" name="queueDisplayName" style={{ marginBottom: 0 }}>
                <Input placeholder="없으면 내부명 사용" maxLength={128} disabled={!canEditSettings} />
              </Form.Item>
              <Form.Item label="외부 착신 방식" name="distributionMode" style={{ marginBottom: 0 }}>
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  options={DISTRIBUTION_MODE_OPTIONS}
                  disabled={!canEditSettings}
                />
              </Form.Item>
              <Form.Item label="분배 전략 (고급)" name="strategy" style={{ marginBottom: 0 }}>
                <Select options={QUEUE_STRATEGY_OPTIONS} disabled={!canEditSettings || distributionMode !== 'DISTRIBUTE'} />
              </Form.Item>
              {distributionMode === 'UNCONDITIONAL' ? (
                <>
                  <Form.Item label="무조건 착신 대상 유형" name="unconditionalTargetType" style={{ marginBottom: 0 }}>
                    <Radio.Group
                      optionType="button"
                      buttonStyle="solid"
                      options={UNCONDITIONAL_TARGET_TYPE_OPTIONS}
                      disabled={!canEditSettings}
                    />
                  </Form.Item>
                  <Form.Item
                    label={
                      unconditionalTargetType === 'AGENT'
                        ? '무조건 착신 상담원'
                        : unconditionalTargetType === 'QUEUE'
                          ? '무조건 착신 분배룰'
                          : '무조건 착신 외부번호'
                    }
                    name="unconditionalTargetValue"
                    style={{ marginBottom: 0 }}
                    rules={[{ required: true, message: '무조건 착신 대상을 선택하세요' }]}
                  >
                    {unconditionalTargetType === 'EXTERNAL_NUMBER' ? (
                      <Input placeholder="01012345678" maxLength={32} disabled={!canEditSettings} />
                    ) : (
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="대상을 선택하세요"
                        options={unconditionalTargetType === 'AGENT' ? unconditionalAgentOptions : unconditionalQueueOptions}
                        disabled={!canEditSettings}
                      />
                    )}
                  </Form.Item>
                </>
              ) : null}
              <Form.Item label="Auto Pause" name="autopause" valuePropName="checked" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', height: 40 }}>
                  <Switch disabled={!canEditSettings} />
                </div>
              </Form.Item>
              <Form.Item label="최대 대기시간(초)" name="maxWaitSeconds" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={3600} style={{ width: '100%' }} disabled={!canEditSettings} />
              </Form.Item>
              <Form.Item label="링 타임아웃(초)" name="ringTimeoutSeconds" style={{ marginBottom: 0 }}>
                <InputNumber min={5} max={120} style={{ width: '100%' }} disabled={!canEditSettings} />
              </Form.Item>
              <Form.Item label="후처리 시간(초)" name="wrapupSeconds" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={600} style={{ width: '100%' }} disabled={!canEditSettings} />
              </Form.Item>
            </div>
          </Card>

          <Card
            title="관련 상담원"
            size="small"
            extra={
              <Typography.Text type="secondary">
                추가/제외/순위 변경 후 저장하면 함께 반영됩니다.
              </Typography.Text>
            }
          >
            {loadingMembers ? (
              <Skeleton active paragraph={{ rows: 10 }} />
            ) : (
              <div className="space-y-4">
                <Space wrap size={12} style={{ marginBottom: 12 }}>
                  <Select
                    style={{ width: 220 }}
                    value={groupFilter}
                    onChange={setGroupFilter}
                    options={groupOptions}
                    placeholder="그룹 조회"
                    disabled={!canEditMembers}
                  />
                  <Input
                    style={{ width: 320 }}
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="그룹명, 상담원ID, 상담원명 검색"
                    disabled={!canEditMembers}
                  />
                </Space>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 92px minmax(0,1fr)',
                    gap: 16,
                    alignItems: 'stretch',
                  }}
                >
                  <Card title={`추가 가능 상담원 (${availableAgents.length})`} size="small" styles={{ body: { padding: 0 } }}>
                    <Table<AgentOption>
                      rowKey="agentId"
                      dataSource={availableAgents}
                      size="small"
                      pagination={false}
                      rowSelection={{
                        selectedRowKeys: selectedAvailableIds,
                        onChange: (keys) => setSelectedAvailableIds(keys as string[]),
                        getCheckboxProps: () => ({ disabled: !canEditMembers }),
                        columnWidth: 40,
                      }}
                      locale={{
                        emptyText: (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="추가 가능한 상담원이 없습니다." />
                        ),
                      }}
                      tableLayout="fixed"
                      scroll={availableTableScroll}
                      columns={[
                        {
                          title: '그룹명',
                          render: (_: unknown, row) => renderSingleLine(getGroupLabel(row, queues)),
                          ellipsis: true,
                        },
                        {
                          title: '상담원ID',
                          dataIndex: 'loginId',
                          render: (value: string) => renderSingleLine(value),
                          ellipsis: true,
                        },
                        {
                          title: '상담원명',
                          dataIndex: 'agentName',
                          render: (value: string) => renderSingleLine(value),
                          ellipsis: true,
                        },
                      ]}
                    />
                  </Card>

                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
                    <Button
                      icon={<ArrowRightOutlined />}
                      onClick={addSelected}
                      disabled={!canEditMembers || selectedAvailableIds.length === 0}
                    >
                      추가
                    </Button>
                    <Button
                      icon={<ArrowLeftOutlined />}
                      onClick={removeSelected}
                      disabled={!canEditMembers || selectedAssignedIds.length === 0}
                    >
                      제외
                    </Button>
                  </div>

                  <Card title={`분배 대상 (${draftMembers.length})`} size="small" styles={{ body: { padding: 0 } }}>
                    <Table<DraftMember>
                      rowKey="agentId"
                      dataSource={draftMembers}
                      size="small"
                      pagination={false}
                      rowSelection={{
                        selectedRowKeys: selectedAssignedIds,
                        onChange: (keys) => setSelectedAssignedIds(keys as string[]),
                        getCheckboxProps: () => ({ disabled: !canEditMembers }),
                        columnWidth: 40,
                      }}
                      locale={{
                        emptyText: (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="선택된 상담원이 없습니다." />
                        ),
                      }}
                      tableLayout="fixed"
                      scroll={draftTableScroll}
                      columns={[
                        {
                          title: '그룹명',
                          render: (_: unknown, row) => renderSingleLine(getGroupLabel(row, queues)),
                          ellipsis: true,
                        },
                        {
                          title: '상담원ID',
                          dataIndex: 'loginId',
                          render: (value: string) => renderSingleLine(value),
                          ellipsis: true,
                        },
                        {
                          title: '상담원명',
                          dataIndex: 'agentName',
                          render: (value: string) => renderSingleLine(value),
                          ellipsis: true,
                        },
                        {
                          title: '순위',
                          width: 96,
                          render: (_: unknown, row, index) => (
                            <Space size={4} wrap={false}>
                              <Typography.Text>{index + 1}</Typography.Text>
                              <Button
                                size="small"
                                icon={<UpOutlined />}
                                onClick={() => moveMember(row.agentId, 'up')}
                                disabled={!canEditMembers || index === 0}
                              />
                              <Button
                                size="small"
                                icon={<DownOutlined />}
                                onClick={() => moveMember(row.agentId, 'down')}
                                disabled={!canEditMembers || index === draftMembers.length - 1}
                              />
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </Card>
                </div>
              </div>
            )}
          </Card>
        </div>
      </Form>
    </Modal>
  );
}
