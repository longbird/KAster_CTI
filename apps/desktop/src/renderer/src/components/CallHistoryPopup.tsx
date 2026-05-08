import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopCallHistoryItem } from '../../../shared/ipc';

function formatTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABELS: Record<string, string> = {
  QUEUED: '대기',
  RINGING_AGENT: '상담원 호출',
  TALKING: '통화 중',
  HOLD: '보류',
  TRANSFERRING: '전환 중',
  AFTER_CALL_WORK: '후처리',
  ENDED: '종료',
};

function formatStatus(value: string) {
  return STATUS_LABELS[value] ?? (value || '-');
}

function formatPhoneValue(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized === '<unknown>' || normalized === 's') {
    return '-';
  }
  return normalized;
}

function formatPhoneDisplay(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('010')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 11 && /^0\d{2}/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && /^0\d{2}/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return value;
}

function secondsBetween(start: string | null, end: string | null) {
  if (!start || !end) {
    return null;
  }
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) {
    return null;
  }
  return Math.round((endTime - startTime) / 1000);
}

function formatDuration(row: DesktopCallHistoryItem) {
  const seconds = row.talkSeconds && row.talkSeconds > 0
    ? row.talkSeconds
    : secondsBetween(row.answeredAt ?? row.startedAt, row.endedAt);
  if (!seconds || seconds <= 0) {
    return '-';
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function canDialFromHistory(row: DesktopCallHistoryItem, field: 'ani' | 'dnis') {
  const direction = row.direction?.toUpperCase();
  if (direction === 'OUTBOUND') {
    return field === 'dnis';
  }
  if (direction === 'INBOUND') {
    return field === 'ani';
  }
  return false;
}

type CallHistoryTab = 'connected' | 'missed' | 'internal';

const TAB_LABELS: Record<CallHistoryTab, string> = {
  connected: '연결',
  missed: '미연결',
  internal: '내선',
};

function isMissed(row: DesktopCallHistoryItem): boolean {
  return !row.answeredAt && row.sessionStatus === 'ENDED';
}

function isInternal(row: DesktopCallHistoryItem): boolean {
  return (row.direction ?? '').toLowerCase() === 'internal';
}

function matchesTab(row: DesktopCallHistoryItem, tab: CallHistoryTab): boolean {
  if (isInternal(row)) {
    return tab === 'internal';
  }
  if (tab === 'internal') {
    return false;
  }
  if (tab === 'missed') {
    return isMissed(row);
  }
  return !isMissed(row);
}

export function CallHistoryPopup() {
  const [rows, setRows] = useState<DesktopCallHistoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<CallHistoryTab>('connected');
  const [loading, setLoading] = useState(true);
  const [dialingNumber, setDialingNumber] = useState<string | null>(null);
  const [dialStatus, setDialStatus] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const loadSeqRef = useRef(0);

  const loadHistory = useCallback(async () => {
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    setLoading(true);
    try {
      const desktopApi =
        typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
      const history = await desktopApi?.getCallHistory?.();
      if (mountedRef.current && loadSeqRef.current === seq) {
        setRows(history ?? []);
      }
    } finally {
      if (mountedRef.current && loadSeqRef.current === seq) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadHistory();
    return () => {
      mountedRef.current = false;
    };
  }, [loadHistory]);

  const tabRows = rows.filter((row) => matchesTab(row, tab));
  const tabCounts: Record<CallHistoryTab, number> = {
    connected: rows.filter((row) => matchesTab(row, 'connected')).length,
    missed: rows.filter((row) => matchesTab(row, 'missed')).length,
    internal: rows.filter((row) => matchesTab(row, 'internal')).length,
  };

  const filtered = tabRows.filter((row) => {
    const keyword = query.trim();
    if (!keyword) {
      return true;
    }

    return [row.ani, row.dnis, row.queueName, row.customer?.customerName, row.primaryAgent?.agentName]
      .filter(Boolean)
      .some((value) => String(value).includes(keyword));
  });

  const handleDial = async (phoneNumber: string) => {
    const desktopApi =
      typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
    if (!desktopApi) {
      return;
    }

    const confirmed = window.confirm(`${phoneNumber} 번호로 발신할까요?`);
    if (!confirmed) {
      return;
    }

    setDialingNumber(phoneNumber);
    setDialStatus(null);
    try {
      const result = await desktopApi.requestHistoryOriginate({ phoneNumber });
      if (!result.ok) {
        throw new Error(result.message ?? '발신 요청 실패');
      }
      setDialStatus(result.message ?? `${phoneNumber} 발신 요청 완료`);
    } catch (error) {
      setDialStatus(error instanceof Error ? error.message : '발신 요청 실패');
    } finally {
      setDialingNumber(null);
    }
  };

  const renderPhoneCell = (
    row: DesktopCallHistoryItem,
    field: 'ani' | 'dnis',
    label: '발신번호' | '수신번호',
    fallback?: string | null,
  ) => {
    const value = formatPhoneValue(row[field]);
    const displayValue = value !== '-' ? formatPhoneDisplay(value) : fallback ? formatPhoneDisplay(fallback) : '-';
    if (value === '-' || !canDialFromHistory(row, field)) {
      return displayValue;
    }

    return (
      <button
        type="button"
        className="popup-dial-button"
        aria-label={`${label} ${displayValue} 발신`}
        disabled={dialingNumber === value}
        onClick={() => void handleDial(value)}
      >
        <span>{displayValue}</span>
        <span className="popup-dial-badge">발신</span>
      </button>
    );
  };

  return (
    <main className="popup-layout">
      <header className="popup-header">
        <div>
          <h1>통화내역</h1>
          <p>{dialStatus ?? (loading ? '조회 중' : `${filtered.length}건`)}</p>
        </div>
        <div className="popup-header-actions">
          <input
            aria-label="통화내역 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="번호, 고객, 상담원"
          />
          <button
            type="button"
            className="popup-refresh-button"
            aria-label="통화내역 새로고침"
            disabled={loading}
            onClick={() => void loadHistory()}
          >
            {loading ? '조회 중' : '갱신'}
          </button>
        </div>
      </header>

      <nav className="popup-tab-strip" aria-label="통화 종류">
        {(Object.keys(TAB_LABELS) as CallHistoryTab[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`popup-tab${tab === value ? ' popup-tab--active' : ''}`}
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
          >
            {TAB_LABELS[value]}
            <span className="popup-tab__count">{tabCounts[value]}</span>
          </button>
        ))}
      </nav>

      <section className="popup-table-shell">
        <table className="popup-table">
          <thead>
            <tr>
              <th>시간</th>
              <th>상태</th>
              <th>발신</th>
              <th>수신</th>
              <th>상담원</th>
              <th>통화</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const missedRow = isMissed(row);
              return (
                <tr key={row.callId} className={missedRow ? 'popup-row--missed' : undefined}>
                  <td>{formatTime(row.startedAt)}</td>
                  <td>{missedRow ? '미연결' : formatStatus(row.sessionStatus)}</td>
                  <td>{renderPhoneCell(row, 'ani', '발신번호')}</td>
                  <td>{renderPhoneCell(row, 'dnis', '수신번호', row.queueName)}</td>
                  <td>{row.primaryAgent?.agentName ?? '-'}</td>
                  <td>{formatDuration(row)}</td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>표시할 통화내역이 없습니다.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
