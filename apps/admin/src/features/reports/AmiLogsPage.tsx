import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Descriptions, Drawer, Input, Space, Table, Tag, Timeline, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';
import { apiClient } from '../../shared/lib/apiClient';
import { downloadCsv } from '../../shared/lib/csv';
import { formatPhoneNumber } from '../../shared/lib/format';
import { usePermissionStore } from '../../store/usePermissionStore';

interface AmiLogRow {
  eventId: string;
  eventName: string;
  eventTime: string;
  linkedid: string | null;
  uniqueid: string | null;
  payload: Record<string, unknown>;
}

interface CallTimelineItem {
  type: string;
  time: string;
  label: string;
  detail?: string | null;
}

interface CallLogRow {
  callId: string;
  linkedid: string;
  callerNumber?: string | null;
  inboundNumber?: string | null;
  queueName?: string | null;
  customerName?: string | null;
  agentName?: string | null;
  agentExtension?: string | null;
  sessionStatus: string;
  direction: string;
  resultCode?: string | null;
  startedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  waitSeconds: number;
  talkSeconds: number;
  abandonFlag: boolean;
  recordingFlag: boolean;
  flowSummary: string;
  timeline: CallTimelineItem[];
}

interface AmiLogResponse {
  calls: CallLogRow[];
  callTotal: number;
  rows: AmiLogRow[];
  page: number;
  pageSize: number;
  total: number;
}

const STATUS_COLOR: Record<string, string> = {
  NEW: 'cyan',
  QUEUED: 'orange',
  RINGING_AGENT: 'gold',
  TALKING: 'blue',
  AFTER_CALL_WORK: 'purple',
  TRANSFERRING: 'geekblue',
  ENDED: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  NEW: '인입',
  QUEUED: '대기',
  RINGING_AGENT: '상담원 호출',
  TALKING: '통화 중',
  AFTER_CALL_WORK: '후처리',
  TRANSFERRING: '전환 중',
  ENDED: '종료',
};

const TIMELINE_COLOR: Record<string, string> = {
  CALL_STARTED: 'blue',
  QUEUE_ENTERED: 'orange',
  AGENT_RINGING: 'gold',
  CALL_ANSWERED: 'green',
  TRANSFER_COMPLETED: 'purple',
  CALL_ENDED: 'gray',
  MEMO_SAVED: 'blue',
  RECORDING_STARTED: 'cyan',
  SMART_ARS_PROMPT: 'blue',
  SMART_ARS_SELECTION: 'gold',
  SMART_ARS_ACTION: 'purple',
  SMART_ARS_RESULT: 'green',
};

const AMI_EVENT_LABEL: Record<string, string> = {
  FullyBooted: '시스템 시작 완료',
  Newchannel: '채널 생성',
  Newstate: '채널 상태 변경',
  Newexten: '다이얼플랜 실행',
  NewCallerid: '발신번호 설정',
  VarSet: '변수 설정',
  DialBegin: '발신 시작',
  DialEnd: '발신 종료',
  QueueCallerJoin: '큐 진입',
  QueueCallerLeave: '큐 이탈',
  QueueCallerAbandon: '대기 포기',
  QueueMemberAdded: '큐 상담원 추가',
  QueueMemberRemoved: '큐 상담원 제거',
  QueueMemberPause: '상담원 휴식',
  QueueMemberStatus: '상담원 큐 상태',
  AgentCalled: '상담원 호출',
  AgentConnect: '상담 연결',
  AgentComplete: '상담 종료',
  BridgeCreate: '통화 연결 생성',
  BridgeDestroy: '통화 연결 종료',
  BridgeEnter: '통화 연결',
  BridgeLeave: '통화 연결 해제',
  BlindTransfer: '블라인드 전환',
  AttendedTransfer: '협의 전환',
  DTMFBegin: '키 입력 시작',
  DTMFEnd: '키 입력 종료',
  Hold: '보류',
  Unhold: '보류 해제',
  MusicOnHoldStart: '대기음 시작',
  MusicOnHoldStop: '대기음 종료',
  HangupRequest: '종료 요청',
  SoftHangupRequest: '강제 종료 요청',
  Hangup: '통화 종료',
  UserEvent: '서비스 이벤트',
};

const AMI_CAUSE_LABEL: Record<string, string> = {
  'Normal Clearing': '정상 종료',
  'User busy': '통화 중',
  'No user responding': '응답 없음',
  'No answer': '미응답',
  'Call Rejected': '통화 거절',
  'Subscriber absent': '가입자 부재',
  'Invalid number format': '잘못된 번호',
};

function formatTime(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function formatShortTime(value?: string | null) {
  return value ? dayjs(value).format('MM-DD HH:mm:ss') : '-';
}

function formatDuration(seconds?: number | null) {
  const value = Math.max(0, Number(seconds ?? 0));
  const min = Math.floor(value / 60);
  const sec = value % 60;
  return min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
}

function getStatusLabel(value?: string | null) {
  return value ? STATUS_LABEL[value] ?? value : '-';
}

function getRawPayload(row: AmiLogRow) {
  const raw = row.payload?.raw;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : row.payload ?? {};
}

function getAmiEventLabel(row: AmiLogRow) {
  const raw = getRawPayload(row);
  if (row.eventName === 'UserEvent' && raw.UserEvent === 'KasterSmartArs') {
    return '스마트 ARS';
  }
  return AMI_EVENT_LABEL[row.eventName] ?? row.eventName;
}

function getSmartArsActionLabel(value?: unknown) {
  switch (String(value ?? '')) {
    case 'QUEUE_ROUTE': return '상담원 연결';
    case 'TRANSFER': return '착신전환';
    case 'SEND_SMS': return '문자 발송';
    case 'OPT_OUT': return '수신거부 등록';
    case 'PLAY_PROMPT': return '멘트 재생';
    default: return String(value ?? '');
  }
}

function getSmartArsResultLabel(value?: unknown) {
  switch (String(value ?? '')) {
    case 'started': return '시작';
    case 'selected': return '선택됨';
    case 'routed': return '큐 연결';
    case 'transfer': return '전환';
    case 'played': return '재생 완료';
    case 'SUCCESS': return '성공';
    case 'FAILURE':
    case 'failure': return '실패';
    case 'timeout': return '입력 없음';
    case 'invalid': return '잘못된 입력';
    default: return String(value ?? '');
  }
}

function formatPromptName(value?: unknown) {
  const prompt = String(value ?? '');
  const name = prompt.split(/[\\/]/).filter(Boolean).pop() || prompt;
  switch (name) {
    case 'smart_ars_guide': return '스마트 ARS 안내 멘트';
    case 'smart_ars_invalid': return '스마트 ARS 잘못된 입력 멘트';
    case 'smart_ars_fail': return '스마트 ARS 실패 안내 멘트';
    case 'smart_080_intro': return '080 수신거부 안내 멘트';
    case 'smart_080_done': return '080 수신거부 완료 멘트';
    default: return name || '-';
  }
}

function getCauseLabel(value?: unknown) {
  const cause = String(value ?? '');
  return AMI_CAUSE_LABEL[cause] ?? cause;
}

function getChannelStateLabel(value?: unknown) {
  switch (String(value ?? '')) {
    case 'Down': return '대기';
    case 'Rsrvd': return '예약';
    case 'OffHook': return '수화기 듦';
    case 'Dialing': return '다이얼 중';
    case 'Ring': return '벨 울림';
    case 'Ringing': return '호출 중';
    case 'Up': return '통화 중';
    case 'Busy': return '통화 중';
    default: return String(value ?? '');
  }
}

function summarizeAmiEvent(row: AmiLogRow) {
  const raw = getRawPayload(row);
  if (row.eventName === 'UserEvent' && raw.UserEvent === 'KasterSmartArs') {
    const stage = String(raw.Stage ?? '');
    if (stage === 'prompt') return `멘트 재생: ${formatPromptName(raw.Prompt)}`;
    if (stage === 'selection') return `사용자 선택: ${String(raw.Digit ?? '-')} · ${getSmartArsActionLabel(raw.Action) || '-'}`;
    if (stage === 'action') return `액션 실행: ${getSmartArsActionLabel(raw.Action)}${raw.Target ? ` · ${String(raw.Target)}` : ''}`;
    if (stage === 'result') return `액션 결과: ${getSmartArsActionLabel(raw.Action)} · ${getSmartArsResultLabel(raw.Result) || '-'}`;
    return '스마트 ARS 이벤트';
  }
  return [
    raw.CallerIDNum ? `발신 ${formatPhoneNumber(String(raw.CallerIDNum))}` : null,
    raw.Exten ? `착신 ${formatPhoneNumber(String(raw.Exten))}` : null,
    raw.Queue ? `큐 ${String(raw.Queue)}` : null,
    raw.MemberName ? `상담원 ${String(raw.MemberName)}` : null,
    raw.ChannelStateDesc ? `상태 ${getChannelStateLabel(raw.ChannelStateDesc)}` : null,
    raw.Digit ? `입력 ${String(raw.Digit)}` : null,
    raw.CauseTxt ? `종료사유 ${getCauseLabel(raw.CauseTxt)}` : null,
  ].filter(Boolean).join(' · ') || '-';
}

export function AmiLogsPage() {
  const reportPermission = usePermissionStore((state) => state.permissionsByMenu['reports/logs']);
  const [calls, setCalls] = useState<CallLogRow[]>([]);
  const [rawRows, setRawRows] = useState<AmiLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [phone, setPhone] = useState('');
  const [linkedid, setLinkedid] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [callTotal, setCallTotal] = useState(0);
  const [selected, setSelected] = useState<CallLogRow | null>(null);

  const load = useCallback(async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/reports/ami-logs', {
        params: {
          from: range[0].toISOString(),
          to: range[1].toISOString(),
          branchId,
          phone: phone || undefined,
          linkedid: linkedid || undefined,
          page: nextPage,
          pageSize: nextPageSize,
        },
      });
      const data = (res.data?.data ?? {}) as AmiLogResponse;
      setCalls(data.calls ?? []);
      setRawRows(data.rows ?? []);
      setCallTotal(data.callTotal ?? 0);
      setPage(data.page ?? nextPage);
      setPageSize(data.pageSize ?? nextPageSize);
    } catch {
      setCalls([]);
      setRawRows([]);
      setCallTotal(0);
    } finally {
      setLoading(false);
    }
  }, [branchId, linkedid, page, pageSize, phone, range]);

  useEffect(() => {
    void load(1, pageSize);
    // 전화번호/Linkedid 검색어 입력이나 페이지 이동은 기존 조회/페이지네이션 동작을 유지한다.
    // 진입, 기간, 지사 변경 시에만 기본 조회를 자동 실행한다.
  }, [branchId, pageSize, range]);

  const exportRows = () => {
    downloadCsv(
      `call-flow-logs-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['시작', '종료', '발신번호', '착신번호', '고객', '상담원', '큐', '상태', '대기', '통화', '흐름', 'Linkedid'],
      calls.map((row) => [
        formatTime(row.startedAt),
        formatTime(row.endedAt),
        formatPhoneNumber(row.callerNumber),
        formatPhoneNumber(row.inboundNumber),
        row.customerName ?? '',
        row.agentName ?? '',
        row.queueName ?? '',
        getStatusLabel(row.sessionStatus),
        row.waitSeconds,
        row.talkSeconds,
        row.flowSummary,
        row.linkedid,
      ]),
    );
  };

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
        호 로그
      </Typography.Title>
      <Typography.Text type="secondary">
        통화 단위로 시작부터 종료까지의 흐름을 확인합니다.
      </Typography.Text>

      <Space style={{ marginTop: 16, marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          value={range}
          onChange={(value) => {
            if (!value?.[0] || !value?.[1]) return;
            setRange([value[0].startOf('day'), value[1].endOf('day')]);
          }}
        />
        <BranchFilterSelect value={branchId} onChange={setBranchId} />
        <Input
          placeholder="전화번호 검색"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ width: 180 }}
        />
        <Input
          placeholder="Linkedid"
          value={linkedid}
          onChange={(e) => setLinkedid(e.target.value)}
          style={{ width: 220 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => void load(1, pageSize)} loading={loading}>
          조회
        </Button>
        {reportPermission?.canExport ? (
          <Button icon={<DownloadOutlined />} onClick={exportRows} disabled={calls.length === 0}>
            CSV 내보내기
          </Button>
        ) : null}
      </Space>

      <Table<CallLogRow>
        className="call-log-table"
        rowKey="callId"
        dataSource={calls}
        loading={loading}
        size="small"
        tableLayout="fixed"
        scroll={{ x: 1120 }}
        onRow={(record) => ({ onClick: () => setSelected(record) })}
        pagination={{
          current: page,
          pageSize,
          total: callTotal,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => void load(nextPage, nextPageSize),
        }}
        columns={[
          {
            title: '시작 / 종료',
            width: 170,
            render: (_: unknown, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text>{formatShortTime(row.startedAt)}</Typography.Text>
                <Typography.Text type="secondary">{formatShortTime(row.endedAt)}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '전화번호',
            width: 180,
            render: (_: unknown, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{formatPhoneNumber(row.callerNumber)}</Typography.Text>
                <Typography.Text type="secondary">→ {formatPhoneNumber(row.inboundNumber)}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '흐름',
            width: 360,
            render: (_: unknown, row) => (
              <div className="call-flow-cell">
                <Typography.Text className="call-flow-summary" ellipsis={{ tooltip: row.flowSummary || '-' }}>
                  {row.flowSummary || '-'}
                </Typography.Text>
                <Typography.Text className="call-flow-linkedid" type="secondary" ellipsis={{ tooltip: row.linkedid || '-' }}>
                  {row.linkedid || '-'}
                </Typography.Text>
              </div>
            ),
          },
          {
            title: '고객',
            width: 110,
            render: (_: unknown, row) => row.customerName ?? '-',
          },
          {
            title: '상담원',
            width: 120,
            render: (_: unknown, row) => row.agentName ? `${row.agentName}${row.agentExtension ? ` (${row.agentExtension})` : ''}` : '-',
          },
          {
            title: '상태',
            width: 110,
            render: (_: unknown, row) => <Tag color={STATUS_COLOR[row.sessionStatus] ?? 'default'}>{getStatusLabel(row.sessionStatus)}</Tag>,
          },
          {
            title: '시간',
            width: 120,
            render: (_: unknown, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text>대기 {formatDuration(row.waitSeconds)}</Typography.Text>
                <Typography.Text type="secondary">통화 {formatDuration(row.talkSeconds)}</Typography.Text>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={selected ? `호 흐름: ${formatPhoneNumber(selected.callerNumber)} -> ${formatPhoneNumber(selected.inboundNumber)}` : '호 흐름'}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={820}
      >
        {selected ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="발신번호">{formatPhoneNumber(selected.callerNumber)}</Descriptions.Item>
              <Descriptions.Item label="착신번호">{formatPhoneNumber(selected.inboundNumber)}</Descriptions.Item>
              <Descriptions.Item label="고객">{selected.customerName ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="상담원">{selected.agentName ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="큐">{selected.queueName ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="상태">{getStatusLabel(selected.sessionStatus)}</Descriptions.Item>
              <Descriptions.Item label="시작">{formatTime(selected.startedAt)}</Descriptions.Item>
              <Descriptions.Item label="종료">{formatTime(selected.endedAt)}</Descriptions.Item>
              <Descriptions.Item label="대기">{formatDuration(selected.waitSeconds)}</Descriptions.Item>
              <Descriptions.Item label="통화">{formatDuration(selected.talkSeconds)}</Descriptions.Item>
            </Descriptions>

            <Timeline
              items={(selected.timeline ?? []).map((item) => ({
                color: TIMELINE_COLOR[item.type] ?? 'blue',
                children: (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{item.label}</Typography.Text>
                    <Typography.Text type="secondary">{formatTime(item.time)}</Typography.Text>
                    {item.detail ? <Typography.Text>{item.detail}</Typography.Text> : null}
                  </Space>
                ),
              }))}
            />

            <Typography.Title level={5} style={{ marginBottom: 0 }}>
              기술 로그
            </Typography.Title>
            <Table<AmiLogRow>
              rowKey="eventId"
              dataSource={rawRows.filter((row) => row.linkedid === selected.linkedid)}
              size="small"
              pagination={false}
              columns={[
                { title: '시각', dataIndex: 'eventTime', width: 160, render: (value: string) => formatShortTime(value) },
                { title: '이벤트', width: 140, render: (_: unknown, row) => <Tag>{getAmiEventLabel(row)}</Tag> },
                { title: '주요 내용', render: (_: unknown, row) => summarizeAmiEvent(row) },
              ]}
            />
          </Space>
        ) : null}
      </Drawer>
    </Card>
  );
}
