import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { downloadCsv } from '../../shared/lib/csv';
import { formatPhoneNumber } from '../../shared/lib/format';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';
import { AdmPageHead } from '../../shared/ui/AdmPageHead';
import { usePermissionStore } from '../../store/usePermissionStore';

interface IvrFailureRow {
  eventId: string;
  eventTime: string;
  linkedid: string | null;
  caller: string | null;
  entryDid: string | null;
  branchId: string | null;
  stage: string | null;
  action: string | null;
  digit: string | null;
  result: string | null;
  target: string | null;
  failureReason: string;
  callId: string | null;
  sessionStatus: string | null;
  queueName: string | null;
  primaryAgentName: string | null;
}

interface IvrFailureResponse {
  rows: IvrFailureRow[];
  page: number;
  pageSize: number;
  total: number;
}

const FAILURE_REASON_COLOR: Record<string, string> = {
  INPUT_TIMEOUT: 'orange',
  INVALID_INPUT: 'red',
  FLOW_FAILURE: 'purple',
  SMS_FAILURE: 'volcano',
  OPT_OUT_FAILURE: 'magenta',
};

const FAILURE_REASON_LABEL: Record<string, string> = {
  INPUT_TIMEOUT: '입력 없음',
  INVALID_INPUT: '잘못된 입력',
  FLOW_FAILURE: '실패 종료',
  SMS_FAILURE: '문자 실패',
  OPT_OUT_FAILURE: '수신거부 실패',
};

function getFailureReasonLabel(value?: string | null) {
  if (!value) return '-';
  return FAILURE_REASON_LABEL[value] ?? value;
}

export function IvrFailuresPage() {
  const reportPermission = usePermissionStore((state) => state.permissionsByMenu['reports/ivr-failures']);
  const [rows, setRows] = useState<IvrFailureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(7, 'day'), dayjs()]);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [entryDid, setEntryDid] = useState('');
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/reports/ivr-failures', {
        params: {
          from: range[0].toISOString(),
          to: range[1].toISOString(),
          branchId,
          entryDid: entryDid.trim() || undefined,
          reason,
          page: nextPage,
          pageSize: nextPageSize,
        },
      });
      const data = (res.data?.data ?? {}) as IvrFailureResponse;
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

  const exportRows = () => {
    downloadCsv(
      `ivr-failures-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['시각', '원인', '고객번호', 'DID', 'DTMF', '액션', '결과', 'Linkedid', 'CallId', '큐', '상담원'],
      rows.map((row) => [
        dayjs(row.eventTime).format('YYYY-MM-DD HH:mm:ss'),
        getFailureReasonLabel(row.failureReason),
        formatPhoneNumber(row.caller),
        formatPhoneNumber(row.entryDid),
        row.digit ?? '',
        row.action ?? '',
        row.result ?? '',
        row.linkedid ?? '',
        row.callId ?? '',
        row.queueName ?? '',
        row.primaryAgentName ?? '',
      ]),
    );
  };

  return (
    <>
      <AdmPageHead
        title="리포트 · IVR 실패"
        sub={`Smart ARS 실패 이벤트 · 총 ${total.toLocaleString()}건`}
      />
      <section className="adm-card" style={{ padding: 14 }}>
        <Space style={{ marginBottom: 16 }} wrap>
          <DatePicker.RangePicker
            showTime
            value={range}
            onChange={(value) => value && setRange(value as [Dayjs, Dayjs])}
          />
          <BranchFilterSelect value={branchId} onChange={setBranchId} />
          <Input
            placeholder="DID"
            value={entryDid}
            onChange={(event) => setEntryDid(event.target.value)}
            style={{ width: 150 }}
          />
          <Select
            allowClear
            placeholder="실패 원인"
            value={reason}
            onChange={setReason}
            options={[
              { value: 'INPUT_TIMEOUT', label: '입력 없음' },
              { value: 'INVALID_INPUT', label: '잘못된 입력' },
              { value: 'FLOW_FAILURE', label: '실패 종료' },
              { value: 'SMS_FAILURE', label: '문자 실패' },
              { value: 'OPT_OUT_FAILURE', label: '수신거부 실패' },
            ]}
            style={{ width: 140 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => void load(1, pageSize)} loading={loading}>
            조회
          </Button>
          {reportPermission?.canExport ? (
            <Button icon={<DownloadOutlined />} onClick={exportRows} disabled={rows.length === 0}>
              CSV 내보내기
            </Button>
          ) : null}
        </Space>

        <Table<IvrFailureRow>
          rowKey="eventId"
          dataSource={rows}
          loading={loading}
          size="small"
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
              title: '원인',
              dataIndex: 'failureReason',
              width: 120,
              render: (value: string) => (
                <Tag color={FAILURE_REASON_COLOR[value] ?? 'default'}>{getFailureReasonLabel(value)}</Tag>
              ),
            },
            { title: '고객번호', dataIndex: 'caller', width: 130, render: (value: string | null) => formatPhoneNumber(value) },
            { title: 'DID', dataIndex: 'entryDid', width: 130, render: (value: string | null) => formatPhoneNumber(value) },
            { title: 'DTMF', dataIndex: 'digit', width: 80, render: (value: string | null) => value || '-' },
            { title: '액션', dataIndex: 'action', width: 120, render: (value: string | null) => value || '-' },
            { title: '결과', dataIndex: 'result', width: 100, render: (value: string | null) => value || '-' },
            {
              title: '통화',
              width: 190,
              render: (_: unknown, row: IvrFailureRow) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text>{row.callId ?? '-'}</Typography.Text>
                  <Typography.Text type="secondary">{row.linkedid ?? '-'}</Typography.Text>
                </Space>
              ),
            },
            { title: '큐', dataIndex: 'queueName', width: 130, render: (value: string | null) => value || '-' },
            { title: '상담원', dataIndex: 'primaryAgentName', width: 110, render: (value: string | null) => value || '-' },
          ]}
        />
      </section>
    </>
  );
}
