import { Button, Card, DatePicker, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { downloadCsv } from '../../shared/lib/csv';
import { usePermissionStore } from '../../store/usePermissionStore';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';

interface MissedRow {
  callId: string;
  ani: string;
  dnis: string;
  didNumber?: string | null;
  representativeNumber?: string | null;
  queueName: string;
  queueDisplayName?: string | null;
  startedAt: string;
  waitSeconds: number;
  primaryAgent: { agentName: string } | null;
}

function getDisplayDid(row: MissedRow) {
  return row.didNumber ?? null;
}

function getRepresentativeDidLines(row: MissedRow) {
  const representative = row.representativeNumber?.trim() || null;
  const did = getDisplayDid(row)?.trim() || null;

  if (representative && did && representative !== did) {
    return { primary: representative, secondary: did };
  }

  return {
    primary: representative ?? did ?? '-',
    secondary: representative && did && representative === did ? null : did,
  };
}

function getQueueLabel(row: MissedRow) {
  return row.queueDisplayName?.trim() || row.queueName || '-';
}

export function MissedCallsPage() {
  const reportPermission = usePermissionStore((state) => state.permissionsByMenu['reports/missed']);
  const [rows, setRows]       = useState<MissedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange]     = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs().endOf('day')]);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/calls/history', {
        params: {
          from: range[0].toISOString(),
          to:   range[1].toISOString(),
          mode: 'missed',
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
      `missed-calls-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['시작', '발신번호', '대표번호', 'DID', '큐', '최종 상담원', '대기(초)', '결과'],
      rows.map((row) => [
        dayjs(row.startedAt).format('YYYY-MM-DD HH:mm:ss'),
        row.ani,
        row.representativeNumber ?? row.didNumber ?? '-',
        row.didNumber ?? '-',
        getQueueLabel(row),
        row.primaryAgent?.agentName ?? '-',
        row.waitSeconds,
        '미연결',
      ]),
    );
  };

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>미연결 콜 조회</Typography.Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          value={range}
          onChange={(value) => {
            if (!value?.[0] || !value?.[1]) return;
            setRange([value[0].startOf('day'), value[1].endOf('day')]);
          }}
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
      <Table<MissedRow>
        rowKey="callId"
        dataSource={rows}
        loading={loading}
        size="small"
        pagination={{ pageSize: 50 }}
        columns={[
          {
            title: '시작',
            dataIndex: 'startedAt',
            render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss'),
            width: 130,
          },
          { title: '발신번호', dataIndex: 'ani', width: 130 },
          {
            title: '대표번호 / DID',
            width: 180,
            render: (_: unknown, row: MissedRow) => {
              const lines = getRepresentativeDidLines(row);
              return (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{lines.primary}</Typography.Text>
                  {lines.secondary ? (
                    <Typography.Text type="secondary">{lines.secondary}</Typography.Text>
                  ) : null}
                </Space>
              );
            },
          },
          {
            title: '분배룰',
            width: 140,
            render: (_: unknown, row: MissedRow) => getQueueLabel(row),
          },
          {
            title: '최종 상담원',
            render: (_: unknown, r: MissedRow) => r.primaryAgent?.agentName ?? '-',
            width: 110,
          },
          { title: '대기(초)', dataIndex: 'waitSeconds', width: 90 },
          {
            title: '결과',
            render: () => <Tag color="red">미연결</Tag>,
            width: 80,
          },
        ]}
      />
    </Card>
  );
}
