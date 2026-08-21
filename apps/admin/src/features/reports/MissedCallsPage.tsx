import { Button, Card, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { downloadCsv } from '../../shared/lib/csv';
import { formatPhoneNumber } from '../../shared/lib/format';
import { usePermissionStore } from '../../store/usePermissionStore';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';
import { ResponsiveTable } from '../../components/ResponsiveTable';

interface MissedRow {
  callId: string;
  ani: string;
  dnis: string;
  didNumber?: string | null;
  representativeNumber?: string | null;
  queueName: string;
  queueDisplayName?: string | null;
  resultCode?: string | null;
  missedReason?: string | null;
  abandonFlag?: boolean;
  startedAt: string;
  waitSeconds: number;
  primaryAgent: { agentName: string } | null;
}

const MISSED_REASON_COLOR: Record<string, string> = {
  CUSTOMER_ABANDONED: 'red',
  QUEUE_TIMEOUT: 'orange',
  QUEUE_NO_ANSWER: 'gold',
  AGENT_NO_ANSWER: 'volcano',
  SYSTEM_RECOVERY: 'purple',
  NO_ANSWER: 'default',
};

const MISSED_REASON_LABEL: Record<string, string> = {
  CUSTOMER_ABANDONED: '고객 포기',
  QUEUE_TIMEOUT: '큐 timeout',
  QUEUE_NO_ANSWER: '큐 미응답',
  AGENT_NO_ANSWER: '상담원 미응답',
  SYSTEM_RECOVERY: '복구 종료',
  NO_ANSWER: '미응답',
};

function getMissedReasonLabel(value?: string | null) {
  if (!value) return '-';
  return MISSED_REASON_LABEL[value] ?? value;
}

function getDisplayDid(row: MissedRow) {
  return row.didNumber ?? null;
}

function getRepresentativeDidLines(row: MissedRow) {
  const representative = row.representativeNumber?.trim() || null;
  const did = getDisplayDid(row)?.trim() || null;

  if (representative && did && representative !== did) {
    return { primary: formatPhoneNumber(representative), secondary: formatPhoneNumber(did) };
  }

  return {
    primary: formatPhoneNumber(representative ?? did),
    secondary: representative && did && representative === did ? null : did ? formatPhoneNumber(did) : null,
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
  const [resultCode, setResultCode] = useState('');
  const [queueName, setQueueName] = useState('');
  const [abandon, setAbandon] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/calls/history', {
        params: {
          from: range[0].toISOString(),
          to:   range[1].toISOString(),
          mode: 'missed',
          branchId,
          resultCode: resultCode.trim() || undefined,
          queueName: queueName.trim() || undefined,
          abandon,
        },
      });
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [abandon, branchId, queueName, range, resultCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportRows = () => {
    downloadCsv(
      `missed-calls-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['시작', '발신번호', '대표번호', 'DID', '큐', '미연결 원인', '결과코드', '호출 상담원', '대기(초)'],
      rows.map((row) => [
        dayjs(row.startedAt).format('YYYY-MM-DD HH:mm:ss'),
        formatPhoneNumber(row.ani),
        formatPhoneNumber(row.representativeNumber ?? row.didNumber),
        formatPhoneNumber(row.didNumber),
        getQueueLabel(row),
        getMissedReasonLabel(row.missedReason),
        row.resultCode ?? '',
        row.primaryAgent?.agentName ?? '-',
        row.waitSeconds,
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
        <Input
          placeholder="결과코드"
          value={resultCode}
          onChange={(event) => setResultCode(event.target.value)}
          style={{ width: 140 }}
        />
        <Input
          placeholder="큐명"
          value={queueName}
          onChange={(event) => setQueueName(event.target.value)}
          style={{ width: 120 }}
        />
        <Select
          allowClear
          placeholder="포기"
          value={abandon}
          onChange={setAbandon}
          options={[
            { value: 'true', label: '포기' },
            { value: 'false', label: '정상' },
          ]}
          style={{ width: 100 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => void load()} loading={loading}>
          조회
        </Button>
        {reportPermission?.canExport ? (
          <Button icon={<DownloadOutlined />} onClick={exportRows} disabled={rows.length === 0}>
            CSV 내보내기
          </Button>
        ) : null}
      </Space>
      <ResponsiveTable<MissedRow>
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
          { title: '발신번호', dataIndex: 'ani', width: 130, render: (value: string) => formatPhoneNumber(value) },
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
            title: '미연결 원인',
            dataIndex: 'missedReason',
            render: (value: string | null) =>
              value ? <Tag color={MISSED_REASON_COLOR[value] ?? 'default'}>{getMissedReasonLabel(value)}</Tag> : '-',
            width: 120,
          },
          { title: '결과코드', dataIndex: 'resultCode', width: 120, render: (value: string | null) => value || '-' },
          {
            title: '포기',
            dataIndex: 'abandonFlag',
            render: (value: boolean) => (value ? <Tag color="red">포기</Tag> : '-'),
            width: 70,
          },
          {
            title: '호출 상담원',
            render: (_: unknown, r: MissedRow) => r.primaryAgent?.agentName ?? '-',
            width: 110,
          },
          { title: '대기(초)', dataIndex: 'waitSeconds', width: 90 },
        ]}
      />
    </Card>
  );
}
