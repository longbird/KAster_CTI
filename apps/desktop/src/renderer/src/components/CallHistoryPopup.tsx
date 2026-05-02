import { useEffect, useState } from 'react';
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

export function CallHistoryPopup() {
  const [rows, setRows] = useState<DesktopCallHistoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const desktopApi =
          typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
        const history = await desktopApi?.getCallHistory?.();
        if (alive) {
          setRows(history ?? []);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = rows.filter((row) => {
    const keyword = query.trim();
    if (!keyword) {
      return true;
    }

    return [row.ani, row.dnis, row.queueName, row.customer?.customerName, row.primaryAgent?.agentName]
      .filter(Boolean)
      .some((value) => String(value).includes(keyword));
  });

  return (
    <main className="popup-layout">
      <header className="popup-header">
        <div>
          <h1>통화내역</h1>
          <p>{loading ? '조회 중' : `${filtered.length}건`}</p>
        </div>
        <input
          aria-label="통화내역 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="번호, 고객, 상담원"
        />
      </header>

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
            {filtered.map((row) => (
              <tr key={row.callId}>
                <td>{formatTime(row.startedAt)}</td>
                <td>{row.sessionStatus}</td>
                <td>{row.ani ?? '-'}</td>
                <td>{row.dnis ?? row.queueName ?? '-'}</td>
                <td>{row.primaryAgent?.agentName ?? '-'}</td>
                <td>{row.talkSeconds == null ? '-' : `${row.talkSeconds}s`}</td>
              </tr>
            ))}
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
