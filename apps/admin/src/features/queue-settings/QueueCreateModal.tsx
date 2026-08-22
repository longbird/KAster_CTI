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
import {
  ALL_GROUPS_VALUE,
  NO_GROUP_VALUE,
  appendGroupMembers,
  filterAvailableAgents,
  getAgentGroupLabel,
  toDraftMember,
  type AgentGroupRef,
  type DraftQueueMember,
  type QueueMemberAgent,
} from './queueMemberGroups';
import { AGENT_OFFER_TIMEOUT_MAX_SECONDS, AGENT_OFFER_TIMEOUT_MIN_SECONDS } from './agentOfferTimeout';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface AgentOption extends QueueMemberAgent {
  isActive: boolean;
}

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
}

interface AgentGroupOption extends AgentGroupRef {
  isActive?: boolean;
}

type DraftMember = DraftQueueMember;

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

export function QueueCreateModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm<{
    queueExten?: string;
    queueDisplayName: string;
    distributionMode?: string;
    unconditionalTargetType?: 'AGENT' | 'QUEUE' | 'EXTERNAL_NUMBER';
    unconditionalTargetValue?: string;
    overflowEnabled?: boolean;
    overflowWaitSeconds?: number;
    overflowTargetType?: 'AI_CENTER' | 'EXTERNAL_NUMBER' | 'QUEUE' | 'EXTENSION';
    overflowTargetValue?: string;
    strategy?: string;
    ringTimeoutSeconds?: number;
    agentOfferTimeoutSeconds?: number;
    wrapupSeconds?: number;
    maxWaitSeconds?: number;
    autopause?: boolean;
  }>();
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [agentGroups, setAgentGroups] = useState<AgentGroupOption[]>([]);
  const [draftMembers, setDraftMembers] = useState<DraftMember[]>([]);
  const [selectedAvailableIds, setSelectedAvailableIds] = useState<string[]>([]);
  const [selectedAssignedIds, setSelectedAssignedIds] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<'ALL' | string>('ALL');
  const [searchText, setSearchText] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const distributionMode = Form.useWatch('distributionMode', form) ?? 'DISTRIBUTE';
  const unconditionalTargetType = Form.useWatch('unconditionalTargetType', form) ?? 'AGENT';
  const overflowEnabled = Form.useWatch('overflowEnabled', form) ?? false;
  const overflowTargetType = Form.useWatch('overflowTargetType', form) ?? 'AI_CENTER';

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setDraftMembers([]);
      setAllAgents([]);
      setQueues([]);
      setAgentGroups([]);
      setSelectedAvailableIds([]);
      setSelectedAssignedIds([]);
      setGroupFilter('ALL');
      setSearchText('');
      setLoadingMembers(false);
      setSaving(false);
      return;
    }

    setLoadingMembers(true);
    void Promise.all([
      apiClient.get('/agents'),
      apiClient.get('/queues'),
      apiClient.get('/admin/settings/agent-groups'),
    ])
      .then(([agentsRes, queuesRes, agentGroupsRes]) => {
        setAllAgents((agentsRes.data?.data ?? []).filter((agent: AgentOption) => agent.isActive));
        setQueues(queuesRes.data?.data ?? []);
        setAgentGroups((agentGroupsRes.data?.data ?? []).filter((group: AgentGroupOption) => group.isActive !== false));
      })
      .catch((err: any) => {
        const msg = err?.response?.data?.error?.message ?? '상담원 목록 조회 실패';
        message.error(msg);
      })
      .finally(() => setLoadingMembers(false));
  }, [open, form]);

  const assignedIdSet = useMemo(() => new Set(draftMembers.map((item) => item.agentId)), [draftMembers]);

  const availableAgents = useMemo(
    () =>
      filterAvailableAgents(allAgents, assignedIdSet, groupFilter, searchText),
    [allAgents, assignedIdSet, groupFilter, searchText],
  );

  const groupOptions = useMemo(
    () => [
      { value: ALL_GROUPS_VALUE, label: '전체' },
      ...agentGroups.map((item) => ({
        value: item.agentGroupId,
        label: item.groupName,
      })),
      { value: NO_GROUP_VALUE, label: '미지정' },
    ],
    [agentGroups],
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
      queues.map((queue) => ({
        value: queue.queueId,
        label: queue.queueDisplayName ?? queue.queueName,
      })),
    [queues],
  );
  const overflowQueueOptions = useMemo(
    () =>
      queues.map((queue) => ({
        value: queue.queueName,
        label: queue.queueDisplayName ?? queue.queueName,
      })),
    [queues],
  );
  const overflowExtensionOptions = useMemo(
    () =>
      allAgents.map((agent) => ({
        value: agent.extension,
        label: `${agent.extension} · ${agent.agentName}`,
      })),
    [allAgents],
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
      ...picked.map((agent, index) => toDraftMember(agent, prev.length + index)),
    ]);
    setSelectedAvailableIds([]);
  };

  const addGroup = () => {
    if (groupFilter === ALL_GROUPS_VALUE) {
      message.warning('추가할 상담원 그룹을 선택하세요');
      return;
    }

    setDraftMembers((prev) => appendGroupMembers(prev, allAgents, groupFilter) as DraftMember[]);
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
    const values = await form.validateFields();
    const {
      overflowEnabled: useOverflow,
      overflowWaitSeconds,
      overflowTargetType,
      overflowTargetValue,
      ...queueValues
    } = values;
    setSaving(true);
    try {
      await apiClient.post('/queues', {
        ...queueValues,
        overflowRules: useOverflow
          ? [{
              triggerMode: 'AFTER_WAIT',
              waitSeconds: overflowWaitSeconds ?? 25,
              targetType: overflowTargetType ?? 'AI_CENTER',
              targetValue: overflowTargetValue,
              resultCode: 'AI_OVERFLOW',
              enabled: true,
              priority: 100,
            }]
          : [],
        members: draftMembers.map((item, index) => ({
          agentId: item.agentId,
          penalty: item.penalty,
          memberOrder: index,
        })),
      });
      message.success('호 분배룰 생성 완료');
      form.resetFields();
      setDraftMembers([]);
      setSelectedAvailableIds([]);
      setSelectedAssignedIds([]);
      onCreated();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '생성 실패';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        <Space align="center">
          <span>신규 호 분배룰 생성</span>
          <FeatureHelpButton featureKey="queue.externalInboundMode" featureName="외부 착신 방식" />
        </Space>
      }
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="생성"
      cancelText="취소"
      width={1240}
      confirmLoading={saving}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          distributionMode: 'DISTRIBUTE',
          unconditionalTargetType: 'AGENT',
          strategy: 'leastrecent',
          ringTimeoutSeconds: 15,
          agentOfferTimeoutSeconds: 10,
          wrapupSeconds: 30,
          maxWaitSeconds: 45,
          autopause: true,
          overflowEnabled: false,
          overflowWaitSeconds: 25,
          overflowTargetType: 'AI_CENTER',
        }}
        onValuesChange={(changedValues) => {
          if ('distributionMode' in changedValues && changedValues.distributionMode !== 'UNCONDITIONAL') {
            form.setFieldValue('unconditionalTargetValue', undefined);
          }
          if ('unconditionalTargetType' in changedValues) {
            form.setFieldValue('unconditionalTargetValue', undefined);
          }
          if ('overflowTargetType' in changedValues) {
            form.setFieldValue('overflowTargetValue', undefined);
          }
        }}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="기본 설정" size="small">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item label="Rule명" name="queueDisplayName" rules={[{ required: true, max: 128 }]}>
                <Input placeholder="영업 대표 큐" />
              </Form.Item>
              <Form.Item label="외부 착신 방식" name="distributionMode" style={{ marginBottom: 0 }}>
                <Radio.Group optionType="button" buttonStyle="solid" options={DISTRIBUTION_MODE_OPTIONS} />
              </Form.Item>
              <Form.Item label="분배 전략 (고급)" name="strategy" style={{ marginBottom: 0 }}>
                <Select options={QUEUE_STRATEGY_OPTIONS} disabled={distributionMode !== 'DISTRIBUTE'} />
              </Form.Item>
              {distributionMode === 'UNCONDITIONAL' ? (
                <>
                  <Form.Item label="무조건 착신 대상 유형" name="unconditionalTargetType" style={{ marginBottom: 0 }}>
                    <Radio.Group optionType="button" buttonStyle="solid" options={UNCONDITIONAL_TARGET_TYPE_OPTIONS} />
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
                      <Input placeholder="01012345678" maxLength={32} />
                    ) : (
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="대상을 선택하세요"
                        options={unconditionalTargetType === 'AGENT' ? unconditionalAgentOptions : unconditionalQueueOptions}
                      />
                    )}
                  </Form.Item>
                </>
              ) : null}
              <Form.Item label="링 타임아웃(초)" name="ringTimeoutSeconds" style={{ marginBottom: 0 }}>
                <InputNumber min={5} max={120} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="수락 대기시간(초)"
                name="agentOfferTimeoutSeconds"
                tooltip={'전화가 배정되면 상담원 화면에 "받으시겠습니까" 가 뜹니다. 이 시간 안에 받지 않으면 다음 상담원에게 넘어가고, 그동안 발신자는 대기음을 계속 듣습니다.'}
                style={{ marginBottom: 0 }}
              >
                <InputNumber
                  min={AGENT_OFFER_TIMEOUT_MIN_SECONDS}
                  max={AGENT_OFFER_TIMEOUT_MAX_SECONDS}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="Auto Pause" name="autopause" valuePropName="checked" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', height: 40 }}>
                  <Switch />
                </div>
              </Form.Item>
              <Form.Item label="최대 대기시간(초)" name="maxWaitSeconds" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={3600} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="후처리 시간(초)" name="wrapupSeconds" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={600} style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </Card>

          <Card title="대기 오버플로우" size="small">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item label="사용" name="overflowEnabled" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch />
              </Form.Item>
              {overflowEnabled ? (
                <>
                  <Form.Item
                    label="대기 시간(초)"
                    name="overflowWaitSeconds"
                    style={{ marginBottom: 0 }}
                    rules={[{ required: true, message: '대기 시간을 입력하세요' }]}
                  >
                    <InputNumber min={1} max={600} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item
                    label="대상 유형"
                    name="overflowTargetType"
                    style={{ marginBottom: 0 }}
                    rules={[{ required: true, message: '대상 유형을 선택하세요' }]}
                  >
                    <Select
                      options={[
                        { value: 'AI_CENTER', label: 'AI센터' },
                        { value: 'EXTERNAL_NUMBER', label: '외부번호' },
                        { value: 'QUEUE', label: '분배룰' },
                        { value: 'EXTENSION', label: '상담원 내선' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    label={overflowTargetType === 'QUEUE' ? '대상 분배룰' : overflowTargetType === 'EXTENSION' ? '대상 내선' : '대상 번호'}
                    name="overflowTargetValue"
                    style={{ marginBottom: 0 }}
                    rules={[{ required: true, message: '오버플로우 대상을 입력하세요' }]}
                  >
                    {overflowTargetType === 'QUEUE' ? (
                      <Select showSearch optionFilterProp="label" options={overflowQueueOptions} />
                    ) : overflowTargetType === 'EXTENSION' ? (
                      <Select showSearch optionFilterProp="label" options={overflowExtensionOptions} />
                    ) : (
                      <Input placeholder="07080120000" maxLength={16} />
                    )}
                  </Form.Item>
                </>
              ) : null}
            </div>
          </Card>

          <Card
            title="관련 상담원"
            size="small"
            extra={
              <Typography.Text type="secondary">
                추가/제외/순위 변경 후 생성하면 함께 반영됩니다.
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
                  />
                  <Button onClick={addGroup} disabled={groupFilter === ALL_GROUPS_VALUE}>
                    그룹 추가
                  </Button>
                  <Input
                    style={{ width: 320 }}
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="상담원 그룹, 상담원ID, 상담원명 검색"
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
                          render: (_: unknown, row) => renderSingleLine(getAgentGroupLabel(row)),
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
                      disabled={selectedAvailableIds.length === 0}
                    >
                      추가
                    </Button>
                    <Button
                      icon={<ArrowLeftOutlined />}
                      onClick={removeSelected}
                      disabled={selectedAssignedIds.length === 0}
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
                          render: (_: unknown, row) => renderSingleLine(getAgentGroupLabel(row)),
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
                                disabled={index === 0}
                              />
                              <Button
                                size="small"
                                icon={<DownOutlined />}
                                onClick={() => moveMember(row.agentId, 'down')}
                                disabled={index === draftMembers.length - 1}
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
