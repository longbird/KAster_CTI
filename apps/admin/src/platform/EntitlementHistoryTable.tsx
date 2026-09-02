import { Card, Empty, Tag, Typography } from 'antd';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { formatEntitlementChange, formatPlatformDateTime, historyFeatureLabel } from './types/entitlementView';
import type { EntitlementHistoryEntry, FeatureEntitlement } from './types/platform';

interface Props {
  entries: EntitlementHistoryEntry[];
  features: FeatureEntitlement[];
  loading: boolean;
}

/** 자격 변경 이력. 누가 언제 왜 바꿨는지가 남지 않으면 자격은 검증할 수 없는 값이 된다. */
export function EntitlementHistoryTable({ entries, features, loading }: Props) {
  const columns = [
    {
      title: '시각',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (createdAt: string) => formatPlatformDateTime(createdAt),
    },
    {
      title: '기능',
      dataIndex: 'featureKey',
      key: 'featureKey',
      render: (_: string, entry: EntitlementHistoryEntry) => historyFeatureLabel(entry, features),
    },
    {
      title: '변경',
      key: 'change',
      width: 160,
      render: (_: unknown, entry: EntitlementHistoryEntry) => (
        <Tag color={entry.afterEnabled ? 'green' : 'default'}>
          {formatEntitlementChange(entry.beforeEnabled, entry.afterEnabled)}
        </Tag>
      ),
    },
    {
      title: '사유',
      dataIndex: 'note',
      key: 'note',
      render: (note: string | null) =>
        note ? note : <Typography.Text type="secondary">-</Typography.Text>,
    },
  ];

  return (
    <Card title="변경 이력" size="small" style={{ marginTop: 16 }}>
      <ResponsiveTable<EntitlementHistoryEntry>
        rowKey="auditLogId"
        columns={columns}
        dataSource={entries}
        loading={loading}
        pagination={false}
        size="small"
        locale={{ emptyText: <Empty description="아직 변경한 적이 없습니다." /> }}
      />
    </Card>
  );
}
