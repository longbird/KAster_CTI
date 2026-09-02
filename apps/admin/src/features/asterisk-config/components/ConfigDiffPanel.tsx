import { Alert, Empty, Space, Table, Tag, Typography } from 'antd';
import { describeLineDelta, type ConfigDiffEntry, type ConfigValidationResult } from '../apply/applyGate';

interface Props {
  diff: ConfigDiffEntry[] | null;
  validation: ConfigValidationResult | null;
}

const STATUS_LABEL: Record<ConfigDiffEntry['status'], { text: string; color: string }> = {
  changed: { text: '변경', color: 'blue' },
  'missing-current': { text: '신규', color: 'green' },
  unchanged: { text: '동일', color: 'default' },
};

/**
 * 적용하면 무엇이 바뀌는지 보여준다.
 *
 * 줄 단위 diff 를 그대로 쏟지 않고 파일별 증감만 보여준다 — 실제 내용은 옆 탭의
 * .conf 미리보기에 있고, 여기서 필요한 판단은 "무엇이 얼마나 바뀌는가" 다.
 */
export function ConfigDiffPanel({ diff, validation }: Props) {
  const failed = validation?.checks.filter((check) => check.status === 'fail') ?? [];

  if (!diff) {
    return <Empty description="변경 내역을 불러오지 못했습니다." />;
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {failed.length > 0 && (
        <Alert
          type="error"
          showIcon
          message="검증에 실패한 항목이 있습니다"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {failed.map((check) => (
                <li key={check.name}>{check.detail || check.name}</li>
              ))}
            </ul>
          }
        />
      )}

      <Alert
        type="warning"
        showIcon
        message="적용하면 운영 중인 PBX 설정이 즉시 덮어써지고 reload 됩니다."
        description="통화가 오가는 중에 바뀝니다. 아래 변경 내역을 확인한 뒤 적용하세요."
      />

      <Table<ConfigDiffEntry>
        rowKey="fileName"
        size="small"
        pagination={false}
        dataSource={diff}
        columns={[
          { title: '파일', dataIndex: 'fileName', key: 'fileName' },
          {
            title: '상태',
            dataIndex: 'status',
            key: 'status',
            width: 90,
            render: (status: ConfigDiffEntry['status']) => (
              <Tag color={STATUS_LABEL[status].color}>{STATUS_LABEL[status].text}</Tag>
            ),
          },
          {
            title: '증감',
            key: 'lines',
            width: 150,
            render: (_: unknown, row: ConfigDiffEntry) => (
              <Typography.Text type={row.status === 'unchanged' ? 'secondary' : undefined}>
                {describeLineDelta(row)}
              </Typography.Text>
            ),
          },
        ]}
      />
    </Space>
  );
}
