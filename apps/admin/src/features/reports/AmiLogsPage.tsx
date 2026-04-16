import { SearchOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Drawer, Input, Space, Table, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';

interface AmiLogRow {
  eventId: string;
  eventName: string;
  eventTime: string;
  linkedid: string | null;
  uniqueid: string | null;
  payload: Record<string, unknown>;
}

interface AmiLogResponse {
  rows: AmiLogRow[];
  page: number;
  pageSize: number;
  total: number;
}

export function AmiLogsPage() {
  const [rows, setRows] = useState<AmiLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(6, 'hour'),
    dayjs(),
  ]);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [eventName, setEventName] = useState('');
  const [linkedid, setLinkedid] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<AmiLogRow | null>(null);

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/reports/ami-logs', {
        params: {
          from: range[0].toISOString(),
          to: range[1].toISOString(),
          branchId,
          eventName: eventName || undefined,
          linkedid: linkedid || undefined,
          page: nextPage,
          pageSize: nextPageSize,
        },
      });
      const data = (res.data?.data ?? {}) as AmiLogResponse;
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? nextPage);
      setPageSize(data.pageSize ?? nextPageSize);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1, pageSize);
  }, []);

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        호 로그 (raw AMI)
      </Typography.Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          showTime
          value={range}
          onChange={(value) => value && setRange(value as [Dayjs, Dayjs])}
        />
        <BranchFilterSelect value={branchId} onChange={setBranchId} />
        <Input
          placeholder="이벤트명 (예: Hangup)"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          style={{ width: 180 }}
        />
        <Input
          placeholder="Linkedid"
          value={linkedid}
          onChange={(e) => setLinkedid(e.target.value)}
          style={{ width: 220 }}
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={() => void load(1, pageSize)}
          loading={loading}
        >
          조회
        </Button>
      </Space>

      <Table<AmiLogRow>
        rowKey="eventId"
        dataSource={rows}
        loading={loading}
        size="small"
        onRow={(record) => ({
          onClick: () => setSelected(record),
        })}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => void load(nextPage, nextPageSize),
        }}
        columns={[
          {
            title: '시각',
            dataIndex: 'eventTime',
            width: 170,
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
          },
          {
            title: '이벤트',
            dataIndex: 'eventName',
            width: 160,
            render: (value: string) => <Tag color="blue">{value}</Tag>,
          },
          {
            title: 'Linkedid',
            dataIndex: 'linkedid',
            width: 220,
            ellipsis: true,
          },
          {
            title: 'Uniqueid',
            dataIndex: 'uniqueid',
            width: 220,
            ellipsis: true,
          },
          {
            title: 'Payload 미리보기',
            render: (_: unknown, row: AmiLogRow) => {
              const preview = JSON.stringify(row.payload ?? {});
              return (
                <Typography.Text ellipsis style={{ maxWidth: 420 }}>
                  {preview}
                </Typography.Text>
              );
            },
          },
        ]}
      />

      <Drawer
        title={selected ? `AMI 이벤트 상세: ${selected.eventName}` : 'AMI 이벤트 상세'}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={720}
      >
        {selected && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Typography.Text strong>
              {dayjs(selected.eventTime).format('YYYY-MM-DD HH:mm:ss')}
            </Typography.Text>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              Linkedid: {selected.linkedid ?? '-'}
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              Uniqueid: {selected.uniqueid ?? '-'}
            </Typography.Paragraph>
            <pre
              style={{
                margin: 0,
                padding: 16,
                borderRadius: 8,
                background: '#f5f5f5',
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(selected.payload ?? {}, null, 2)}
            </pre>
          </Space>
        )}
      </Drawer>
    </Card>
  );
}
