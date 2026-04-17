import { Button, Card, Checkbox, Skeleton, Space, Table, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { useAuthStore } from '../../store/useAuthStore';
import { usePermissionStore } from '../../store/usePermissionStore';
import { labelForMenuPath, menuKeyToPath } from '../../shared/permissions/menuConfig';

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

interface PermissionsPayload {
  roles: string[];
  menuKeys: string[];
  matrix: RoleMatrixRow[];
}

const ACTION_LABELS: Record<PermissionAction, string> = {
  canView: '조회',
  canCreate: '등록',
  canUpdate: '수정',
  canDelete: '삭제',
  canOperate: '실행',
  canExport: '내보내기',
};

export function PermissionSettingsPage() {
  const [payload, setPayload] = useState<PermissionsPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const agent = useAuthStore((s) => s.agent);
  const loadForRole = usePermissionStore((s) => s.loadForRole);

  const load = async () => {
    try {
      const res = await apiClient.get('/admin/settings/permissions');
      setPayload(res.data?.data ?? null);
    } catch {
      setPayload({ roles: [], menuKeys: [], matrix: [] });
      message.error('권한 설정을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(
    () => payload?.menuKeys.map((menuKey) => ({ key: menuKey, menuKey })) ?? [],
    [payload],
  );

  const toggle = (roleCode: string, menuKey: string, action: PermissionAction, checked: boolean) => {
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

  const save = async () => {
    if (!payload) return;
    setSaving(true);
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
      setPayload(res.data?.data ?? payload);
      await loadForRole(agent?.role);
      message.success('권한 설정을 저장했습니다.');
    } catch {
      message.error('권한 설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!payload) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
          권한 설정
        </Typography.Title>
        <Button type="primary" onClick={() => void save()} loading={saving}>
          저장
        </Button>
      </Space>

      <Typography.Paragraph type="secondary">
        2차 범위는 역할별 액션 권한입니다. 메뉴 노출은 `조회` 기준으로 유지되고, 서버는 일부 관리 경로부터 액션 단위로 강제합니다.
      </Typography.Paragraph>

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
            title: role.roleCode,
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
                    onChange={(e) => toggle(role.roleCode, row.menuKey, action, e.target.checked)}
                  />
                );
              },
            })),
          })),
        ]}
      />
    </Card>
  );
}
