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
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { QUEUE_STRATEGY_OPTIONS } from './queueStrategy';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
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

export function QueueCreateModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm<{
    queueExten?: string;
    queueDisplayName: string;
    strategy?: string;
    ringTimeoutSeconds?: number;
    wrapupSeconds?: number;
    maxWaitSeconds?: number;
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

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setDraftMembers([]);
      setAllAgents([]);
      setQueues([]);
      setSelectedAvailableIds([]);
      setSelectedAssignedIds([]);
      setGroupFilter('ALL');
      setSearchText('');
      setLoadingMembers(false);
      setSaving(false);
      return;
    }

    setLoadingMembers(true);
    void Promise.all([apiClient.get('/agents'), apiClient.get('/queues')])
      .then(([agentsRes, queuesRes]) => {
        setAllAgents((agentsRes.data?.data ?? []).filter((agent: AgentOption) => agent.isActive));
        setQueues(queuesRes.data?.data ?? []);
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
    const values = await form.validateFields();
    setSaving(true);
    try {
      await apiClient.post('/queues', {
        ...values,
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
      title="신규 호 분배룰 생성"
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
          strategy: 'leastrecent',
          ringTimeoutSeconds: 15,
          wrapupSeconds: 30,
          maxWaitSeconds: 45,
          autopause: true,
        }}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="기본 설정" size="small">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item label="Rule명" name="queueDisplayName" rules={[{ required: true, max: 128 }]}>
                <Input placeholder="영업 대표 큐" />
              </Form.Item>
              <Form.Item label="분배 전략" name="strategy" style={{ marginBottom: 0 }}>
                <Select options={QUEUE_STRATEGY_OPTIONS} />
              </Form.Item>
              <Form.Item label="링 타임아웃(초)" name="ringTimeoutSeconds" style={{ marginBottom: 0 }}>
                <InputNumber min={5} max={120} style={{ width: '100%' }} />
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
                  <Input
                    style={{ width: 320 }}
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="그룹명, 상담원ID, 상담원명 검색"
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
