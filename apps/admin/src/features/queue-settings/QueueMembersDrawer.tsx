import {
  Button,
  Drawer,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
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
    isActive: boolean;
  };
}

interface AgentOption {
  agentId: string;
  agentName: string;
  extension: string;
  isActive: boolean;
}

interface Props {
  queue: QueueInfo | null;
  onClose: () => void;
}

export function QueueMembersDrawer({ queue, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [adding, setAdding] = useState<{ agentId?: string; penalty: number; memberOrder: number }>({
    penalty: 0,
    memberOrder: 0,
  });
  const [saving, setSaving] = useState(false);

  const loadMembers = async () => {
    if (!queue) return;
    const res = await apiClient.get(`/queues/${queue.queueId}/members`);
    setMembers(res.data?.data ?? []);
  };

  const loadAgents = async () => {
    const res = await apiClient.get('/agents');
    setAllAgents((res.data?.data ?? []).filter((a: AgentOption) => a.isActive));
  };

  useEffect(() => {
    if (!queue) return;
    void Promise.all([loadMembers(), loadAgents()]);
  }, [queue]);

  const saveMembers = async (list: Array<{ agentId: string; penalty: number; memberOrder: number }>) => {
    if (!queue) return;
    setSaving(true);
    try {
      await apiClient.put(`/queues/${queue.queueId}/members`, { members: list });
      message.success('멤버 저장 완료');
      setAdding({ penalty: 0, memberOrder: 0 });
      await loadMembers();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '저장 실패';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const addMember = async () => {
    if (!adding.agentId) {
      message.warning('상담원을 선택하세요');
      return;
    }
    if (members.some((m) => m.agentId === adding.agentId)) {
      message.warning('이미 멤버로 등록된 상담원입니다');
      return;
    }
    const newList = [
      ...members.map((m) => ({
        agentId: m.agentId,
        penalty: m.penalty,
        memberOrder: m.memberOrder,
      })),
      { agentId: adding.agentId, penalty: adding.penalty, memberOrder: members.length },
    ];
    await saveMembers(newList);
  };

  const removeMember = async (agentId: string) => {
    const newList = members
      .filter((m) => m.agentId !== agentId)
      .map((m, i) => ({ agentId: m.agentId, penalty: m.penalty, memberOrder: i }));
    await saveMembers(newList);
  };

  const nonMembers = allAgents.filter((a) => !members.some((m) => m.agentId === a.agentId));

  return (
    <Drawer
      title={`큐 멤버 관리 - ${queue?.queueDisplayName ?? queue?.queueName ?? ''}`}
      open={!!queue}
      onClose={onClose}
      width={560}
      destroyOnClose
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          style={{ width: 220 }}
          placeholder="상담원 선택"
          value={adding.agentId}
          onChange={(v) => setAdding((prev) => ({ ...prev, agentId: v }))}
          options={nonMembers.map((a) => ({
            value: a.agentId,
            label: `${a.agentName} (${a.extension})`,
          }))}
          showSearch
          filterOption={(input, opt) =>
            String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />
        <InputNumber
          min={0}
          max={9}
          value={adding.penalty}
          onChange={(v) => setAdding((prev) => ({ ...prev, penalty: v ?? 0 }))}
          addonBefore="Penalty"
          style={{ width: 120 }}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void addMember()} loading={saving}>
          추가
        </Button>
      </Space>

      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        현재 멤버 ({members.length}명)
      </Typography.Text>
      <Table<Member>
        rowKey="queueMemberId"
        dataSource={members}
        size="small"
        pagination={false}
        columns={[
          {
            title: '순서',
            dataIndex: 'memberOrder',
            width: 60,
            render: (_: unknown, __: Member, idx: number) => idx + 1,
          },
          { title: '이름', render: (_: unknown, r: Member) => r.agent.agentName },
          { title: '내선', render: (_: unknown, r: Member) => r.agent.extension, width: 80 },
          { title: 'Penalty', dataIndex: 'penalty', width: 80 },
          {
            title: '',
            width: 60,
            render: (_: unknown, r: Member) => (
              <Popconfirm
                title="멤버에서 제거할까요?"
                onConfirm={() => void removeMember(r.agentId)}
                okText="예"
                cancelText="아니오"
              >
                <Button size="small" danger icon={<MinusOutlined />} loading={saving} />
              </Popconfirm>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
