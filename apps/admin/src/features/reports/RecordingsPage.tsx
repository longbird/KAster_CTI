import { Button, Card, DatePicker, Space, Table, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';

interface RecRow {
  recordingId: string;
  linkedid: string;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: string | null;
  durationSeconds: number;
  recordingStartedAt: string | null;
  session: {
    ani: string;
    queueName: string;
    primaryAgent: { agentName: string } | null;
  } | null;
}

export function RecordingsPage() {
  const [rows, setRows]       = useState<RecRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange]     = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs()]);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/calls/recordings/list', {
        params: {
          from: range[0].toISOString(),
          to:   range[1].toISOString(),
          branchId,
        },
      });
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>녹취 목록</Typography.Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          showTime
          value={range}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
        />
        <BranchFilterSelect value={branchId} onChange={setBranchId} />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => void load()} loading={loading}>
          조회
        </Button>
      </Space>
      <Table<RecRow>
        rowKey="recordingId"
        dataSource={rows}
        loading={loading}
        size="small"
        pagination={{ pageSize: 50 }}
        columns={[
          {
            title: '시작',
            dataIndex: 'recordingStartedAt',
            render: (v: string) => (v ? dayjs(v).format('MM-DD HH:mm:ss') : '-'),
            width: 130,
          },
          {
            title: '발신번호',
            render: (_: unknown, r: RecRow) => r.session?.ani ?? '-',
            width: 120,
          },
          {
            title: '큐',
            render: (_: unknown, r: RecRow) => r.session?.queueName ?? '-',
            width: 120,
          },
          {
            title: '상담원',
            render: (_: unknown, r: RecRow) => r.session?.primaryAgent?.agentName ?? '-',
            width: 100,
          },
          { title: '파일명', dataIndex: 'fileName', ellipsis: true },
          {
            title: '형식',
            dataIndex: 'fileFormat',
            render: (v: string) => <Tag>{v.toUpperCase()}</Tag>,
            width: 70,
          },
          { title: '길이(초)', dataIndex: 'durationSeconds', width: 80 },
        ]}
      />
    </Card>
  );
}
