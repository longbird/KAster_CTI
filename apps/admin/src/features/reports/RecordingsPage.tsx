import { Button, Card, DatePicker, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { downloadCsv } from '../../shared/lib/csv';
import { usePermissionStore } from '../../store/usePermissionStore';
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
    dnis?: string | null;
    didNumber?: string | null;
    representativeNumber?: string | null;
    queueName: string;
    primaryAgent: { agentName: string } | null;
  } | null;
}

export function RecordingsPage() {
  const reportPermission = usePermissionStore((state) => state.permissionsByMenu['reports/recordings']);
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

  const exportRows = () => {
    downloadCsv(
      `recordings-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['시작', '발신번호', '대표번호', 'DID', '큐', '상담원', '파일명', '형식', '길이(초)'],
      rows.map((row) => [
        row.recordingStartedAt ? dayjs(row.recordingStartedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
        row.session?.ani ?? '-',
        row.session?.representativeNumber ?? '-',
        row.session?.didNumber ?? row.session?.dnis ?? '-',
        row.session?.queueName ?? '-',
        row.session?.primaryAgent?.agentName ?? '-',
        row.fileName,
        row.fileFormat.toUpperCase(),
        row.durationSeconds,
      ]),
    );
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
        {reportPermission?.canExport ? (
          <Button icon={<DownloadOutlined />} onClick={exportRows} disabled={rows.length === 0}>
            CSV 내보내기
          </Button>
        ) : null}
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
            title: '대표번호 / DID',
            render: (_: unknown, r: RecRow) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{r.session?.representativeNumber ?? '-'}</Typography.Text>
                <Typography.Text type="secondary">{r.session?.didNumber ?? r.session?.dnis ?? '-'}</Typography.Text>
              </Space>
            ),
            width: 180,
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
