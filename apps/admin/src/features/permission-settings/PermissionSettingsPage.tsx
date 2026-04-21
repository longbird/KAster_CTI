import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Row,
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
import { labelForMenuPath, menuKeyToPath } from '../../shared/permissions/menuConfig';
import { useAuthStore } from '../../store/useAuthStore';
import { usePermissionStore } from '../../store/usePermissionStore';

type PermissionAction = 'canView' | 'canCreate' | 'canUpdate' | 'canDelete' | 'canOperate' | 'canExport';

interface PermissionEntry {
  menuKey: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canOperate: boolean;
  canExport: boolean;
}

interface RoleMatrixRow {
  roleCode: string;
  permissions: PermissionEntry[];
}

interface AgentSummary {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  role: string;
  isActive: boolean;
}

interface PermissionsPayload {
  roles: string[];
  menuKeys: string[];
  matrix: RoleMatrixRow[];
  agents: AgentSummary[];
}

interface AccountPermissionPayload {
  agent: AgentSummary;
  roles: string[];
  menuKeys: string[];
  permissions: PermissionEntry[];
}

const ACTION_LABELS: Record<PermissionAction, string> = {
  canView: '조회',
  canCreate: '등록',
  canUpdate: '수정',
  canDelete: '삭제',
  canOperate: '실행',
  canExport: '내보내기',
};

const ROLE_LABELS: Record<string, string> = {
  agent: '상담원',
  supervisor: '슈퍼바이저',
  admin: '관리자',
};

function clonePermissions(entries: PermissionEntry[]) {
  return entries.map((entry) => ({ ...entry }));
}

function roleLabel(roleCode: string) {
  return ROLE_LABELS[roleCode] ?? roleCode;
}

export function PermissionSettingsPage() {
  const [payload, setPayload] = useState<PermissionsPayload | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();
  const [accountAgent, setAccountAgent] = useState<AgentSummary | null>(null);
  const [accountBaseRoleCode, setAccountBaseRoleCode] = useState<string>('agent');
  const [accountPermissions, setAccountPermissions] = useState<PermissionEntry[]>([]);
  const currentAgent = useAuthStore((s) => s.agent);
  const loadForAgent = usePermissionStore((s) => s.loadForAgent);

  const load = async () => {
    try {
      const res = await apiClient.get('/admin/settings/permissions');
      const nextPayload = (res.data?.data ?? null) as PermissionsPayload | null;
      setPayload(nextPayload);
      setSelectedAgentId((prev) => {
        if (prev && nextPayload?.agents.some((agent) => agent.agentId === prev)) {
          return prev;
        }
        return nextPayload?.agents.find((agent) => agent.isActive)?.agentId ?? nextPayload?.agents[0]?.agentId;
      });
    } catch {
      setPayload({ roles: [], menuKeys: [], matrix: [], agents: [] });
      message.error('권한 설정을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedAgentId) {
      setAccountAgent(null);
      setAccountPermissions([]);
      return;
    }

    setLoadingAccount(true);
    void apiClient
      .get(`/admin/settings/permissions/accounts/${selectedAgentId}`)
      .then((res) => {
        const data = (res.data?.data ?? null) as AccountPermissionPayload | null;
        if (!data) return;
        setAccountAgent(data.agent);
        setAccountBaseRoleCode(data.agent.role);
        setAccountPermissions(clonePermissions(data.permissions));
      })
      .catch(() => {
        setAccountAgent(null);
        setAccountPermissions([]);
        message.error('계정별 권한 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        setLoadingAccount(false);
      });
  }, [selectedAgentId]);

  const rows = useMemo(
    () => payload?.menuKeys.map((menuKey) => ({ key: menuKey, menuKey })) ?? [],
    [payload],
  );

  const rolePermissionsByCode = useMemo(
    () => Object.fromEntries((payload?.matrix ?? []).map((row) => [row.roleCode, row.permissions])),
    [payload],
  );

  const baseRolePermissions = useMemo(
    () => clonePermissions(rolePermissionsByCode[accountBaseRoleCode] ?? []),
    [accountBaseRoleCode, rolePermissionsByCode],
  );

  const toggleRolePermission = (
    roleCode: string,
    menuKey: string,
    action: PermissionAction,
    checked: boolean,
  ) => {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        matrix: prev.matrix.map((role) =>
          role.roleCode !== roleCode
            ? role
            : {
                ...role,
                permissions: role.permissions.map((entry) =>
                  entry.menuKey !== menuKey ? entry : { ...entry, [action]: checked },
                ),
              },
        ),
      };
    });
  };

  const toggleAccountPermission = (menuKey: string, action: PermissionAction, checked: boolean) => {
    setAccountPermissions((prev) =>
      prev.map((entry) => (entry.menuKey !== menuKey ? entry : { ...entry, [action]: checked })),
    );
  };

  const saveRolePermissions = async () => {
    if (!payload) return;
    setSavingRole(true);
    try {
      const items = payload.matrix.flatMap((role) =>
        role.permissions.map((entry) => ({
          roleCode: role.roleCode,
          menuKey: entry.menuKey,
          canView: entry.canView,
          canCreate: entry.canCreate,
          canUpdate: entry.canUpdate,
          canDelete: entry.canDelete,
          canOperate: entry.canOperate,
          canExport: entry.canExport,
        })),
      );
      const res = await apiClient.post('/admin/settings/permissions', { items });
      const nextPayload = (res.data?.data ?? payload) as PermissionsPayload;
      setPayload(nextPayload);
      await loadForAgent(currentAgent);
      message.success('기본 권한을 저장했습니다.');
    } catch {
      message.error('기본 권한 저장에 실패했습니다.');
    } finally {
      setSavingRole(false);
    }
  };

  const resetAccountToBase = () => {
    setAccountPermissions(clonePermissions(baseRolePermissions));
  };

  const saveAccountPermissions = async () => {
    if (!accountAgent) return;
    setSavingAccount(true);
    try {
      const res = await apiClient.post(`/admin/settings/permissions/accounts/${accountAgent.agentId}`, {
        baseRoleCode: accountBaseRoleCode,
        items: accountPermissions,
      });
      const data = (res.data?.data ?? null) as AccountPermissionPayload | null;
      if (data) {
        setAccountAgent(data.agent);
        setAccountBaseRoleCode(data.agent.role);
        setAccountPermissions(clonePermissions(data.permissions));
        setPayload((prev) =>
          prev
            ? {
                ...prev,
                agents: prev.agents.map((agent) => (agent.agentId === data.agent.agentId ? data.agent : agent)),
              }
            : prev,
        );
      }
      if (currentAgent?.agentId === accountAgent.agentId) {
        await loadForAgent({ ...currentAgent, role: accountBaseRoleCode });
      }
      message.success(
        currentAgent?.agentId === accountAgent.agentId && currentAgent.role !== accountBaseRoleCode
          ? '계정 권한을 저장했습니다. 본인 기본 권한 변경은 다시 로그인 후 완전히 반영됩니다.'
          : '계정 권한을 저장했습니다.',
      );
    } catch {
      message.error('계정 권한 저장에 실패했습니다.');
    } finally {
      setSavingAccount(false);
    }
  };

  if (!payload) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Card>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>
            권한 관리
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            역할별 기본 권한을 유지하면서, 특정 계정은 기본 권한을 선택한 뒤 개별 메뉴 권한만 추가로 조정할 수 있습니다.
          </Typography.Paragraph>
        </div>

        <Tabs
          items={[
            {
              key: 'roles',
              label: '기본 권한',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="관리자/슈퍼바이저/상담원의 기본 메뉴 권한입니다."
                    description="개별 계정 권한은 이 기본값을 먼저 따르고, 계정 탭에서 필요한 메뉴만 따로 수정합니다."
                  />
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Typography.Text strong>역할별 메뉴/액션 권한</Typography.Text>
                    <Button type="primary" onClick={() => void saveRolePermissions()} loading={savingRole}>
                      기본 권한 저장
                    </Button>
                  </Space>
                  <Table<{ key: string; menuKey: string }>
                    rowKey="key"
                    dataSource={rows}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    columns={[
                      {
                        title: '메뉴',
                        dataIndex: 'menuKey',
                        fixed: 'left',
                        width: 220,
                        render: (menuKey: string) => labelForMenuPath(menuKeyToPath(menuKey)),
                      },
                      ...payload.matrix.map((role) => ({
                        title: roleLabel(role.roleCode),
                        key: role.roleCode,
                        children: (Object.keys(ACTION_LABELS) as PermissionAction[]).map((action) => ({
                          title: ACTION_LABELS[action],
                          key: `${role.roleCode}:${action}`,
                          width: 80,
                          align: 'center' as const,
                          render: (_: unknown, row: { menuKey: string }) => {
                            const value = role.permissions.find((entry) => entry.menuKey === row.menuKey)?.[action] ?? false;
                            return (
                              <Checkbox
                                checked={value}
                                onChange={(e) => toggleRolePermission(role.roleCode, row.menuKey, action, e.target.checked)}
                              />
                            );
                          },
                        })),
                      })),
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: 'accounts',
              label: '개별 계정 권한',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="개별 계정은 기본 권한(role)을 선택한 뒤 필요한 메뉴만 추가 조정합니다."
                    description="저장 시 기본 권한은 해당 계정의 역할에도 반영됩니다. 현재 로그인한 본인 계정은 기본 권한 변경 후 다시 로그인해야 완전히 반영됩니다."
                  />
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <Card size="small">
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <Typography.Text strong>대상 계정</Typography.Text>
                          <Select
                            showSearch
                            optionFilterProp="label"
                            placeholder="계정을 선택하세요"
                            value={selectedAgentId}
                            onChange={setSelectedAgentId}
                            options={payload.agents.map((agent) => ({
                              value: agent.agentId,
                              label: `${agent.agentName} (${agent.loginId} / ${agent.extension})`,
                            }))}
                          />
                          {accountAgent ? (
                            <Space wrap>
                              <Tag color={accountAgent.isActive ? 'green' : 'default'}>
                                {accountAgent.isActive ? '활성' : '비활성'}
                              </Tag>
                              <Tag>{accountAgent.loginId}</Tag>
                              <Tag>{accountAgent.extension}</Tag>
                            </Space>
                          ) : null}
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card size="small">
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <Typography.Text strong>기본 권한</Typography.Text>
                          <Select
                            value={accountBaseRoleCode}
                            onChange={(value) => {
                              setAccountBaseRoleCode(value);
                              setAccountPermissions(clonePermissions(rolePermissionsByCode[value] ?? []));
                            }}
                            disabled={!accountAgent}
                            options={payload.roles.map((roleCode) => ({
                              value: roleCode,
                              label: roleLabel(roleCode),
                            }))}
                          />
                          <Typography.Text type="secondary">
                            선택한 기본 권한을 기준으로 아래 메뉴 권한을 수정합니다.
                          </Typography.Text>
                        </Space>
                      </Card>
                    </Col>
                  </Row>

                  {loadingAccount ? (
                    <Skeleton active paragraph={{ rows: 8 }} />
                  ) : accountAgent ? (
                    <>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Typography.Text strong>
                          {accountAgent.agentName} 계정 권한
                        </Typography.Text>
                        <Space>
                          <Button onClick={resetAccountToBase}>기본값으로 초기화</Button>
                          <Button type="primary" onClick={() => void saveAccountPermissions()} loading={savingAccount}>
                            계정 권한 저장
                          </Button>
                        </Space>
                      </Space>

                      <Table<{ key: string; menuKey: string }>
                        rowKey="key"
                        dataSource={rows}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        columns={[
                          {
                            title: '메뉴',
                            dataIndex: 'menuKey',
                            fixed: 'left',
                            width: 240,
                            render: (menuKey: string) => {
                              const baseEntry = baseRolePermissions.find((entry) => entry.menuKey === menuKey);
                              const currentEntry = accountPermissions.find((entry) => entry.menuKey === menuKey);
                              const overridden =
                                !!baseEntry &&
                                !!currentEntry &&
                                (
                                  baseEntry.canView !== currentEntry.canView ||
                                  baseEntry.canCreate !== currentEntry.canCreate ||
                                  baseEntry.canUpdate !== currentEntry.canUpdate ||
                                  baseEntry.canDelete !== currentEntry.canDelete ||
                                  baseEntry.canOperate !== currentEntry.canOperate ||
                                  baseEntry.canExport !== currentEntry.canExport
                                );

                              return (
                                <Space>
                                  <span>{labelForMenuPath(menuKeyToPath(menuKey))}</span>
                                  {overridden ? <Tag color="orange">개별 수정</Tag> : null}
                                </Space>
                              );
                            },
                          },
                          ...(Object.keys(ACTION_LABELS) as PermissionAction[]).map((action) => ({
                            title: ACTION_LABELS[action],
                            key: action,
                            width: 88,
                            align: 'center' as const,
                            render: (_: unknown, row: { menuKey: string }) => {
                              const value = accountPermissions.find((entry) => entry.menuKey === row.menuKey)?.[action] ?? false;
                              return (
                                <Checkbox
                                  checked={value}
                                  onChange={(e) => toggleAccountPermission(row.menuKey, action, e.target.checked)}
                                />
                              );
                            },
                          })),
                        ]}
                      />
                    </>
                  ) : (
                    <Typography.Text type="secondary">관리할 계정을 선택하세요.</Typography.Text>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Space>
    </Card>
  );
}
