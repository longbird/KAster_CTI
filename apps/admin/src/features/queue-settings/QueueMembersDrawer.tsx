import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DownOutlined,
  HolderOutlined,
  SaveOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface QueueInfo {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
}

interface Member {
  queueMemberId: string;
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

interface Props {
  queue: QueueInfo | null;
  onClose: () => void;
}

function getGroupLabel(agent: { defaultQueueId?: string | null }, queues: QueueOption[]) {
  const found = queues.find((queue) => queue.queueId === agent.defaultQueueId);
  return found?.queueDisplayName ?? found?.queueName ?? '미지정';
}

function DraggableRow({
  index,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  isDraggingOver,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  index: number;
  onRowDragStart: (i: number) => void;
  onRowDragOver: (i: number) => void;
  onRowDrop: () => void;
  isDraggingOver: boolean;
}) {
  return (
    <tr
      {...props}
      draggable
      onDragStart={() => onRowDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onRowDragOver(index); }}
      onDrop={onRowDrop}
      style={{
        ...props.style,
        cursor: 'grab',
        background: isDraggingOver ? '#e6f4ff' : undefined,
        borderTop: isDraggingOver ? '2px solid #1677ff' : undefined,
      }}
    />
  );
}

export function QueueMembersDrawer({ queue, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [draftMembers, setDraftMembers] = useState<DraftMember[]>([]);
  const [selectedAvailableIds, setSelectedAvailableIds] = useState<string[]>([]);
  const [selectedAssignedIds, setSelectedAssignedIds] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<'ALL' | string>('ALL');
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const loadMembers = async () => {
    if (!queue) return;
    const res = await apiClient.get(`/queues/${queue.queueId}/members`);
    const loaded = res.data?.data ?? [];
    setMembers(loaded);
    setDraftMembers(
      loaded.map((item: Member, index: number) => ({
        agentId: item.agentId,
        agentName: item.agent.agentName,
        loginId: item.agent.loginId ?? '',
        extension: item.agent.extension,
        defaultQueueId: item.agent.defaultQueueId ?? null,
        penalty: item.penalty ?? 0,
        memberOrder: item.memberOrder ?? index,
      })),
    );
  };

  const loadAgents = async () => {
    const [agentsRes, queuesRes] = await Promise.all([apiClient.get('/agents'), apiClient.get('/queues')]);
    setAllAgents((agentsRes.data?.data ?? []).filter((a: AgentOption) => a.isActive));
    setQueues(queuesRes.data?.data ?? []);
  };

  useEffect(() => {
    if (!queue) return;
    setSelectedAvailableIds([]);
    setSelectedAssignedIds([]);
    setGroupFilter('ALL');
    setSearchText('');
    void Promise.all([loadMembers(), loadAgents()]);
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

  const handleDragDrop = () => {
    const from = dragIndexRef.current;
    const to = dragOverIndex;
    if (from === null || to === null || from === to) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      return;
    }
    setDraftMembers((prev) => {
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next.map((item, order) => ({ ...item, memberOrder: order }));
    });
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const saveMembers = async () => {
    if (!queue) return;
    setSaving(true);
    try {
      await apiClient.put(`/queues/${queue.queueId}/members`, {
        members: draftMembers.map((item, index) => ({
          agentId: item.agentId,
          penalty: item.penalty,
          memberOrder: index,
        })),
      });
      message.success('호 분배룰 저장 완료');
      await loadMembers();
      setSelectedAssignedIds([]);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '저장 실패';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={`호 분배 Rule 설정 - ${queue?.queueDisplayName ?? queue?.queueName ?? ''}`}
      open={!!queue}
      onClose={onClose}
      width={1080}
      destroyOnClose
      extra={
        <Button type="primary" icon={<SaveOutlined />} onClick={() => void saveMembers()} loading={saving}>
          저장
        </Button>
      }
    >
      <div className="space-y-4">
        <Space wrap size={12}>
          <Select
            style={{ width: 220 }}
            value={groupFilter}
            onChange={setGroupFilter}
            options={groupOptions}
            placeholder="그룹 조회"
          />
          <Input
            style={{ width: 280 }}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="그룹명, 상담원ID, 상담원명 검색"
          />
        </Space>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px minmax(0,1fr)', gap: 16, alignItems: 'stretch' }}>
          <Card
            title={`대상 상담원 (${availableAgents.length})`}
            styles={{ body: { padding: 0 } }}
          >
            <Table<AgentOption>
              rowKey="agentId"
              dataSource={availableAgents}
              size="small"
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedAvailableIds,
                onChange: (keys) => setSelectedAvailableIds(keys as string[]),
              }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="추가 가능한 상담원이 없습니다." /> }}
              scroll={{ y: 420 }}
              columns={[
                {
                  title: '그룹명',
                  render: (_: unknown, row) => getGroupLabel(row, queues),
                  width: 140,
                },
                {
                  title: '상담원ID',
                  dataIndex: 'loginId',
                  width: 140,
                },
                {
                  title: '상담원명',
                  dataIndex: 'agentName',
                },
              ]}
            />
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
            <Button icon={<ArrowRightOutlined />} onClick={addSelected} disabled={selectedAvailableIds.length === 0}>
              추가
            </Button>
            <Button icon={<ArrowLeftOutlined />} onClick={removeSelected} disabled={selectedAssignedIds.length === 0}>
              제외
            </Button>
          </div>

          <Card
            title={`분배 대상 (${draftMembers.length})`}
            styles={{ body: { padding: 0 } }}
          >
            <Table<DraftMember>
              rowKey="agentId"
              dataSource={draftMembers}
              size="small"
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedAssignedIds,
                onChange: (keys) => setSelectedAssignedIds(keys as string[]),
              }}
              components={{
                body: {
                  row: (props: React.HTMLAttributes<HTMLTableRowElement> & { 'data-row-key': string }) => {
                    const rowIndex = draftMembers.findIndex((m) => m.agentId === props['data-row-key']);
                    return (
                      <DraggableRow
                        {...props}
                        index={rowIndex}
                        onRowDragStart={(i) => { dragIndexRef.current = i; }}
                        onRowDragOver={(i) => setDragOverIndex(i)}
                        onRowDrop={handleDragDrop}
                        isDraggingOver={dragOverIndex === rowIndex}
                      />
                    );
                  },
                },
              }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="선택된 상담원이 없습니다." /> }}
              scroll={{ y: 420 }}
              columns={[
                {
                  title: '',
                  width: 32,
                  render: () => <HolderOutlined style={{ color: '#bbb', cursor: 'grab' }} />,
                },
                {
                  title: '그룹명',
                  render: (_: unknown, row) => getGroupLabel(row, queues),
                  width: 130,
                },
                {
                  title: '상담원ID',
                  dataIndex: 'loginId',
                  width: 130,
                },
                {
                  title: '상담원명',
                  dataIndex: 'agentName',
                },
                {
                  title: '순위',
                  width: 110,
                  render: (_: unknown, row, index) => (
                    <Space size={4}>
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
    </Drawer>
  );
}
