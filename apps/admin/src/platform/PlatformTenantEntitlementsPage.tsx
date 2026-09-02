import { ArrowLeftOutlined, LockOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Space, Switch, Tag, Tooltip, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ResponsiveTable } from '../components/ResponsiveTable';
import {
  getTenantEntitlements,
  listTenantEntitlementHistory,
  updateTenantEntitlement,
} from './api/platformEntitlementsApi';
import { listPlatformTenants } from './api/platformTenantsApi';
import {
  EntitlementChangeModal,
  type EntitlementChangeRequest,
  type EntitlementChangeValues,
} from './EntitlementChangeModal';
import { EntitlementHistoryTable } from './EntitlementHistoryTable';
import { serverErrorMessage } from './lib/serverError';
import {
  describeEntitlementSource,
  entitlementSwitchState,
  formatPlatformDateTime,
  needsIrreversibleAck,
  sortEntitlementRows,
} from './types/entitlementView';
import type {
  EntitlementHistoryEntry,
  FeatureEntitlement,
  PlatformTenantRow,
} from './types/platform';

export function PlatformTenantEntitlementsPage() {
  const { tenantId = '' } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [features, setFeatures] = useState<FeatureEntitlement[]>([]);
  const [history, setHistory] = useState<EntitlementHistoryEntry[]>([]);
  const [tenant, setTenant] = useState<PlatformTenantRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [request, setRequest] = useState<EntitlementChangeRequest | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // 자격과 이력은 항상 같이 읽는다. 한쪽만 새로 고치면 방금 바꾼 값과 이력이 어긋나 보인다.
      const [entitlements, entries] = await Promise.all([
        getTenantEntitlements(tenantId),
        listTenantEntitlementHistory(tenantId),
      ]);
      setFeatures(entitlements?.features ?? []);
      setHistory(entries);
    } catch (error) {
      console.error(error);
      message.error(serverErrorMessage(error, '기능 자격을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // 제목에 테넌트 이름을 쓰기 위한 조회다. 실패해도 자격 화면 자체는 살아 있어야 하므로 조용히 넘긴다.
    let cancelled = false;
    void listPlatformTenants()
      .then((rows) => {
        if (!cancelled) setTenant(rows.find((row) => row.tenantId === tenantId) ?? null);
      })
      .catch(() => {
        if (!cancelled) setTenant(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const rows = useMemo(() => sortEntitlementRows(features), [features]);

  const handleConfirm = async (values: EntitlementChangeValues) => {
    if (!request) return;
    const { feature, nextEnabled } = request;

    setSaving(true);
    try {
      await updateTenantEntitlement(tenantId, feature.key, {
        enabled: nextEnabled,
        note: values.note || undefined,
        // 확인이 필요 없는 조작에는 이 필드를 아예 보내지 않는다.
        acknowledgeIrreversible: needsIrreversibleAck(feature, nextEnabled) ? true : undefined,
      });
      message.success(`${feature.name} 자격을 ${nextEnabled ? '허용' : '차단'}했습니다.`);
      setRequest(null);
      await load();
    } catch (error) {
      console.error(error);
      // 서버가 거부 이유(끄기 409 / 확인 없는 켜기 400)를 문장으로 준다. 그대로 보여준다.
      message.error(serverErrorMessage(error, '자격을 변경하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: '기능',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, feature: FeatureEntitlement) => (
        <Space direction="vertical" size={2}>
          <Space size={6}>
            <Typography.Text strong>{name}</Typography.Text>
            {feature.irreversible ? <Tag color="orange">되돌릴 수 없음</Tag> : null}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {feature.description}
          </Typography.Text>
          <Typography.Text code style={{ fontSize: 11 }}>
            {feature.key}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '출처',
      key: 'source',
      width: 140,
      render: (_: unknown, feature: FeatureEntitlement) => (
        <Tag color={feature.source === 'row' ? 'blue' : 'default'}>{describeEntitlementSource(feature)}</Tag>
      ),
    },
    {
      title: '켠 시각',
      dataIndex: 'enabledAt',
      key: 'enabledAt',
      width: 160,
      render: (enabledAt: string | null) => formatPlatformDateTime(enabledAt),
    },
    {
      title: '자격',
      key: 'enabled',
      width: 160,
      fixed: 'right' as const,
      render: (_: unknown, feature: FeatureEntitlement) => {
        const state = entitlementSwitchState(feature);
        const control = (
          <Switch
            checked={state.checked}
            disabled={state.locked || saving}
            checkedChildren="허용"
            unCheckedChildren="차단"
            // 스위치는 여기서 바로 뒤집지 않는다. 확인 대화상자를 지나 서버가 받아준 뒤
            // 다시 읽은 값으로만 바뀐다.
            onChange={(nextEnabled) => setRequest({ feature, nextEnabled })}
          />
        );

        if (!state.locked) return control;

        return (
          <Space size={6}>
            {/* disabled 인 antd 컴포넌트는 마우스 이벤트를 삼켜 툴팁이 안 뜬다. span 으로 감싸야 뜬다. */}
            <Tooltip title={state.lockReason}>
              <span style={{ display: 'inline-flex' }}>{control}</span>
            </Tooltip>
            <Tooltip title={state.lockReason}>
              <Tag icon={<LockOutlined />} color="orange">
                잠김
              </Tag>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/platform')}>
              목록
            </Button>
            <span>{tenant ? `${tenant.tenantName} 기능 자격` : '기능 자격'}</span>
            {tenant ? <Typography.Text code>{tenant.tenantCode}</Typography.Text> : null}
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            새로고침
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="자격이 없으면 이 테넌트에서는 메뉴가 감춰지고 API 도 거부됩니다."
          description="자격은 최상위 게이트입니다. 자격을 켜도 서버 env 킬스위치나 테넌트 자체 설정이 꺼져 있으면 기능은 동작하지 않습니다."
        />

        <ResponsiveTable<FeatureEntitlement>
          rowKey="key"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          size="middle"
        />
      </Card>

      <EntitlementHistoryTable entries={history} features={features} loading={loading} />

      <EntitlementChangeModal
        request={request}
        saving={saving}
        onCancel={() => setRequest(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
