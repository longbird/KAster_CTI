import { Alert, Card, Input, Space, Switch, Table, Tag, Typography, notification } from 'antd';
import { useEffect, useState } from 'react';
import { getFeatureCodes, upsertFeatureCode } from '../api/asteriskConfigApi';
import type { FeatureCode } from '../types/asterisk-config';
import { FeatureHelpButton } from '../../../shared/help/FeatureHelpButton';
import { usePermissionStore } from '../../../store/usePermissionStore';
import { ResponsiveTable } from '../../../components/ResponsiveTable';

const INVOCATION_META: Record<FeatureCode['invocation'], { label: string; color: string; hint: string }> = {
  HANDSET_DIAL: {
    label: '단말 다이얼',
    color: 'green',
    hint: '상담원이 전화기에서 눌러 호출합니다.',
  },
  SERVER_DTMF: {
    label: '서버 전송',
    color: 'default',
    hint: '서버가 PBX 로 보내는 DTMF 입니다. 전화기에서 눌러도 동작하지 않습니다.',
  },
};

export function FeatureCodesTab() {
  const [rows, setRows] = useState<FeatureCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canUpdate = permission?.canUpdate ?? true;

  const load = async () => {
    setLoading(true);
    try {
      const next = await getFeatureCodes();
      setRows(next);
      setDrafts(Object.fromEntries(next.map((row) => [row.featureKey, row.code ?? ''])));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async (row: FeatureCode, patch: { code?: string | null; enabled?: boolean }) => {
    try {
      await upsertFeatureCode({
        featureKey: row.featureKey,
        code: patch.code !== undefined ? patch.code : row.code,
        enabled: patch.enabled !== undefined ? patch.enabled : row.enabled,
      });
      notification.success({ message: `${row.label} 기능코드를 저장했습니다.` });
      await load();
    } catch (error: any) {
      notification.error({
        message: '기능코드 저장 실패',
        description: error?.response?.data?.error?.message,
      });
      // 서버가 거부했으면 화면 값을 되돌려 실제 저장 상태와 어긋나지 않게 한다.
      await load();
    }
  };

  const columns = [
    {
      title: '기능',
      dataIndex: 'label',
      width: 160,
      render: (value: string, row: FeatureCode) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.description}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '호출 방식',
      dataIndex: 'invocation',
      width: 130,
      render: (value: FeatureCode['invocation']) => (
        <Tag color={INVOCATION_META[value].color}>{INVOCATION_META[value].label}</Tag>
      ),
    },
    {
      title: '코드',
      dataIndex: 'code',
      width: 200,
      render: (_: unknown, row: FeatureCode) => (
        <Input
          value={drafts[row.featureKey] ?? ''}
          placeholder={row.optional ? '미설정 (비활성)' : '필수'}
          disabled={!canUpdate}
          maxLength={16}
          onChange={(e) => setDrafts((prev) => ({ ...prev, [row.featureKey]: e.target.value }))}
          onBlur={() => {
            const next = (drafts[row.featureKey] ?? '').trim();
            if (next === (row.code ?? '')) return;
            void save(row, { code: next });
          }}
        />
      ),
    },
    {
      title: '사용',
      dataIndex: 'enabled',
      width: 90,
      render: (value: boolean, row: FeatureCode) => (
        <Switch
          checked={value}
          disabled={!canUpdate}
          onChange={(checked) => void save(row, { enabled: checked })}
        />
      ),
    },
    {
      title: '상태',
      dataIndex: 'configured',
      width: 110,
      render: (value: boolean) => (
        value
          ? <Tag color="blue">설정됨</Tag>
          : <Tag>기본값</Tag>
      ),
    },
  ];

  return (
    <Card
      title={(
        <Space align="center">
          <span>기능코드</span>
          <FeatureHelpButton featureKey="asterisk.featureCodes" featureName="기능코드" />
        </Space>
      )}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="기능코드는 지원되는 기능에 코드 값을 붙이는 방식입니다."
          description={(
            <Space direction="vertical" size={2}>
              <span>{INVOCATION_META.HANDSET_DIAL.hint}</span>
              <span>{INVOCATION_META.SERVER_DTMF.hint}</span>
              <span>코드는 * 또는 # 로 시작하고 뒤에 숫자 1~6자리를 씁니다. 내선·DID·호 분배룰·단축 발신과 겹칠 수 없습니다.</span>
              <span>저장하면 PBX 설정이 다시 적용됩니다.</span>
            </Space>
          )}
        />
        <ResponsiveTable
          rowKey="featureKey"
          size="small"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={false}
        />
      </Space>
    </Card>
  );
}
