import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface AgentRef {
  agentId: string;
  agentCode?: string;
  agentName?: string;
}
interface AgentGroupRef {
  agentGroupId: string;
  groupCode?: string;
  groupName?: string;
}
interface BranchRef {
  branchId: string;
  branchCode?: string;
  branchName?: string;
}

interface RuleAgentRow {
  shareRuleAgentId: string;
  agentId: string;
  priority: number;
  agent: AgentRef;
}
interface RuleAgentGroupRow {
  shareRuleAgentGroupId: string;
  agentGroupId: string;
  priority: number;
  agentGroup: AgentGroupRef;
}
interface RuleBranchRow {
  shareRuleBranchId: string;
  branchId: string;
  mainPhone: string | null;
  transferPhone: string | null;
  branch: BranchRef;
}

interface ShareRuleDetail {
  shareRuleId: string;
  ruleCode: string;
  ruleName: string;
  agents: RuleAgentRow[];
  agentGroups: RuleAgentGroupRow[];
  branches: RuleBranchRow[];
}

interface AgentOption {
  agentId: string;
  agentCode: string;
  agentName: string;
}
interface AgentGroupOption {
  agentGroupId: string;
  groupCode: string;
  groupName: string;
}
interface BranchOption {
  branchId: string;
  branchCode: string;
  branchName: string;
  isActive?: boolean;
}

interface AgentEntry {
  agentId: string;
  priority: number;
}
interface GroupEntry {
  agentGroupId: string;
  priority: number;
}
interface BranchEntry {
  branchId: string;
  mainPhone: string;
  transferPhone: string;
}

export function ShareRuleEditDrawer({
  shareRuleId,
  onClose,
}: {
  shareRuleId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [savingAgents, setSavingAgents] = useState(false);
  const [savingBranches, setSavingBranches] = useState(false);
  const [detail, setDetail] = useState<ShareRuleDetail | null>(null);

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentGroups, setAgentGroups] = useState<AgentGroupOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);

  const [agentEntries, setAgentEntries] = useState<AgentEntry[]>([]);
  const [groupEntries, setGroupEntries] = useState<GroupEntry[]>([]);
  const [branchEntries, setBranchEntries] = useState<BranchEntry[]>([]);

  useEffect(() => {
    if (!shareRuleId) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      apiClient.get(`/admin/settings/share-rules/${shareRuleId}`),
      apiClient.get('/agents'),
      apiClient.get('/admin/settings/agent-groups').catch(() => ({ data: { data: [] } })),
      apiClient.get('/admin/settings/branches').catch(() => ({ data: { data: [] } })),
    ])
      .then(([detailRes, agentsRes, groupsRes, branchesRes]) => {
        if (!active) return;
        const d: ShareRuleDetail = detailRes.data?.data;
        setDetail(d);
        setAgentEntries(
          (d.agents ?? []).map((row) => ({ agentId: row.agentId, priority: row.priority })),
        );
        setGroupEntries(
          (d.agentGroups ?? []).map((row) => ({
            agentGroupId: row.agentGroupId,
            priority: row.priority,
          })),
        );
        setBranchEntries(
          (d.branches ?? []).map((row) => ({
            branchId: row.branchId,
            mainPhone: row.mainPhone ?? '',
            transferPhone: row.transferPhone ?? '',
          })),
        );

        setAgents(
          (agentsRes.data?.data ?? []).map((a: any) => ({
            agentId: a.agentId,
            agentCode: a.agentCode,
            agentName: a.agentName,
          })),
        );
        setAgentGroups(
          (groupsRes.data?.data ?? []).map((g: any) => ({
            agentGroupId: g.agentGroupId,
            groupCode: g.groupCode,
            groupName: g.groupName,
          })),
        );
        setBranches(
          (branchesRes.data?.data ?? []).filter((b: BranchOption) => b.isActive !== false),
        );
      })
      .catch(() => {
        if (active) message.error('공유규칙 상세를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shareRuleId]);

  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.agentId, a])),
    [agents],
  );
  const groupMap = useMemo(
    () => new Map(agentGroups.map((g) => [g.agentGroupId, g])),
    [agentGroups],
  );
  const branchMap = useMemo(
    () => new Map(branches.map((b) => [b.branchId, b])),
    [branches],
  );

  const availableAgents = agents.filter(
    (a) => !agentEntries.some((e) => e.agentId === a.agentId),
  );
  const availableGroups = agentGroups.filter(
    (g) => !groupEntries.some((e) => e.agentGroupId === g.agentGroupId),
  );
  const availableBranches = branches.filter(
    (b) => !branchEntries.some((e) => e.branchId === b.branchId),
  );

  const saveAgents = async () => {
    if (!shareRuleId) return;
    setSavingAgents(true);
    try {
      await apiClient.put(`/admin/settings/share-rules/${shareRuleId}/agents`, {
        agents: agentEntries.map((e, idx) => ({
          agentId: e.agentId,
          priority: e.priority ?? idx,
        })),
        agentGroups: groupEntries.map((e, idx) => ({
          agentGroupId: e.agentGroupId,
          priority: e.priority ?? idx,
        })),
      });
      message.success('상담원·그룹 매트릭스를 저장했습니다.');
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
    } finally {
      setSavingAgents(false);
    }
  };

  const saveBranches = async () => {
    if (!shareRuleId) return;
    setSavingBranches(true);
    try {
      await apiClient.put(`/admin/settings/share-rules/${shareRuleId}/branches`, {
        branches: branchEntries.map((e) => ({
          branchId: e.branchId,
          mainPhone: e.mainPhone || undefined,
          transferPhone: e.transferPhone || undefined,
        })),
      });
      message.success('지사 매트릭스를 저장했습니다.');
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
    } finally {
      setSavingBranches(false);
    }
  };

  return (
    <Drawer
      open={!!shareRuleId}
      onClose={onClose}
      width={920}
      title={
        detail ? (
          <Space>
            <Typography.Text strong>{detail.ruleName}</Typography.Text>
            <Tag>{detail.ruleCode}</Tag>
          </Space>
        ) : (
          '공유규칙 매트릭스'
        )
      }
      destroyOnClose
    >
      {loading || !detail ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Tabs
          defaultActiveKey="agents"
          items={[
            {
              key: 'agents',
              label: '상담원·그룹 우선순위',
              children: (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Space>
                    <Select
                      placeholder="상담원 추가"
                      style={{ width: 240 }}
                      value={undefined}
                      showSearch
                      optionFilterProp="label"
                      onChange={(v) =>
                        v &&
                        setAgentEntries((prev) => [
                          ...prev,
                          { agentId: v, priority: prev.length },
                        ])
                      }
                      options={availableAgents.map((a) => ({
                        value: a.agentId,
                        label: `${a.agentName} (${a.agentCode})`,
                      }))}
                    />
                    <Select
                      placeholder="그룹 추가"
                      style={{ width: 220 }}
                      value={undefined}
                      showSearch
                      optionFilterProp="label"
                      onChange={(v) =>
                        v &&
                        setGroupEntries((prev) => [
                          ...prev,
                          { agentGroupId: v, priority: prev.length },
                        ])
                      }
                      options={availableGroups.map((g) => ({
                        value: g.agentGroupId,
                        label: `${g.groupName} (${g.groupCode})`,
                      }))}
                    />
                    <Button
                      type="primary"
                      onClick={saveAgents}
                      loading={savingAgents}
                    >
                      저장
                    </Button>
                  </Space>

                  <Typography.Text type="secondary">상담원 ({agentEntries.length}명)</Typography.Text>
                  {agentEntries.length === 0 ? (
                    <Empty description="상담원 미지정" />
                  ) : (
                    <Table<AgentEntry>
                      rowKey="agentId"
                      dataSource={agentEntries}
                      pagination={false}
                      size="small"
                      columns={[
                        {
                          title: '상담원',
                          render: (_: unknown, r: AgentEntry) => {
                            const a = agentMap.get(r.agentId);
                            return a ? `${a.agentName} (${a.agentCode})` : r.agentId;
                          },
                        },
                        {
                          title: '우선순위',
                          width: 140,
                          render: (_: unknown, r: AgentEntry) => (
                            <InputNumber
                              min={0}
                              value={r.priority}
                              onChange={(v) =>
                                setAgentEntries((prev) =>
                                  prev.map((e) =>
                                    e.agentId === r.agentId
                                      ? { ...e, priority: typeof v === 'number' ? v : 0 }
                                      : e,
                                  ),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: '',
                          width: 60,
                          render: (_: unknown, r: AgentEntry) => (
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() =>
                                setAgentEntries((prev) =>
                                  prev.filter((e) => e.agentId !== r.agentId),
                                )
                              }
                            />
                          ),
                        },
                      ]}
                    />
                  )}

                  <Typography.Text type="secondary">상담원 그룹 ({groupEntries.length}개)</Typography.Text>
                  {groupEntries.length === 0 ? (
                    <Empty description="그룹 미지정" />
                  ) : (
                    <Table<GroupEntry>
                      rowKey="agentGroupId"
                      dataSource={groupEntries}
                      pagination={false}
                      size="small"
                      columns={[
                        {
                          title: '그룹',
                          render: (_: unknown, r: GroupEntry) => {
                            const g = groupMap.get(r.agentGroupId);
                            return g ? `${g.groupName} (${g.groupCode})` : r.agentGroupId;
                          },
                        },
                        {
                          title: '우선순위',
                          width: 140,
                          render: (_: unknown, r: GroupEntry) => (
                            <InputNumber
                              min={0}
                              value={r.priority}
                              onChange={(v) =>
                                setGroupEntries((prev) =>
                                  prev.map((e) =>
                                    e.agentGroupId === r.agentGroupId
                                      ? { ...e, priority: typeof v === 'number' ? v : 0 }
                                      : e,
                                  ),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: '',
                          width: 60,
                          render: (_: unknown, r: GroupEntry) => (
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() =>
                                setGroupEntries((prev) =>
                                  prev.filter((e) => e.agentGroupId !== r.agentGroupId),
                                )
                              }
                            />
                          ),
                        },
                      ]}
                    />
                  )}
                </Space>
              ),
            },
            {
              key: 'branches',
              label: '지사 적용',
              children: (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Space>
                    <Select
                      placeholder="지사 추가"
                      style={{ width: 280 }}
                      value={undefined}
                      showSearch
                      optionFilterProp="label"
                      onChange={(v) =>
                        v &&
                        setBranchEntries((prev) => [
                          ...prev,
                          { branchId: v, mainPhone: '', transferPhone: '' },
                        ])
                      }
                      options={availableBranches.map((b) => ({
                        value: b.branchId,
                        label: `${b.branchName} (${b.branchCode})`,
                      }))}
                    />
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={saveBranches}
                      loading={savingBranches}
                    >
                      저장
                    </Button>
                  </Space>

                  {branchEntries.length === 0 ? (
                    <Empty description="지사 미지정" />
                  ) : (
                    <Table<BranchEntry>
                      rowKey="branchId"
                      dataSource={branchEntries}
                      pagination={false}
                      size="small"
                      columns={[
                        {
                          title: '지사',
                          render: (_: unknown, r: BranchEntry) => {
                            const b = branchMap.get(r.branchId);
                            return b ? `${b.branchName} (${b.branchCode})` : r.branchId;
                          },
                        },
                        {
                          title: '대표 번호',
                          width: 180,
                          render: (_: unknown, r: BranchEntry) => (
                            <Input
                              value={r.mainPhone}
                              maxLength={32}
                              placeholder="예: 02-1234-5678"
                              onChange={(e) =>
                                setBranchEntries((prev) =>
                                  prev.map((entry) =>
                                    entry.branchId === r.branchId
                                      ? { ...entry, mainPhone: e.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: '전환 번호',
                          width: 180,
                          render: (_: unknown, r: BranchEntry) => (
                            <Input
                              value={r.transferPhone}
                              maxLength={32}
                              placeholder="예: 02-1234-5679"
                              onChange={(e) =>
                                setBranchEntries((prev) =>
                                  prev.map((entry) =>
                                    entry.branchId === r.branchId
                                      ? { ...entry, transferPhone: e.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: '',
                          width: 60,
                          render: (_: unknown, r: BranchEntry) => (
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() =>
                                setBranchEntries((prev) =>
                                  prev.filter((entry) => entry.branchId !== r.branchId),
                                )
                              }
                            />
                          ),
                        },
                      ]}
                    />
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
}
