import { useEffect, useRef, useState } from 'react';
import type { DesktopCallContext } from '../../../shared/ipc';

const MEMO_DEBOUNCE_MS = 800;

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

function formatTalkSeconds(seconds: number | null): string {
  if (seconds == null) {
    return '-';
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatGrade(grade: string | null): string {
  if (!grade) {
    return '일반';
  }
  switch (grade) {
    case 'VIP':
      return 'VIP';
    case 'BLACK':
      return '블랙';
    case 'NORMAL':
    default:
      return '일반';
  }
}

export function CallInfoPanel({
  context,
  loading,
  error,
  agentId,
  onSaveMemo,
}: {
  context: DesktopCallContext | null;
  loading: boolean;
  error: string | null;
  agentId: string | null;
  onSaveMemo: (memoText: string) => Promise<void> | void;
}) {
  const initialMemo = context?.memos?.[0]?.memoText ?? '';
  const [memoDraft, setMemoDraft] = useState(initialMemo);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedRef = useRef(initialMemo);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next = context?.memos?.[0]?.memoText ?? '';
    setMemoDraft(next);
    lastSavedRef.current = next;
    setSavingState('idle');
  }, [context?.callId, context?.memos]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const scheduleSave = (next: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      void (async () => {
        if (!agentId) {
          setSavingState('error');
          return;
        }
        if (next === lastSavedRef.current) {
          return;
        }
        setSavingState('saving');
        try {
          await onSaveMemo(next);
          lastSavedRef.current = next;
          setSavingState('saved');
        } catch {
          setSavingState('error');
        }
      })();
    }, MEMO_DEBOUNCE_MS);
  };

  const handleMemoChange = (value: string) => {
    setMemoDraft(value);
    scheduleSave(value);
  };

  if (loading && !context) {
    return (
      <section className="console-section call-info-panel">
        <p className="console-muted">고객 정보 조회 중...</p>
      </section>
    );
  }

  if (error && !context) {
    return (
      <section className="console-section call-info-panel">
        <p className="console-muted dial-error">고객 정보 조회 실패: {error}</p>
      </section>
    );
  }

  const customer = context?.customer;
  const history = context?.history ?? [];

  return (
    <section className="console-section call-info-panel">
      <div className="console-section-title">
        <h2>고객 정보</h2>
        {customer ? <span className={`grade-badge grade-${customer.grade ?? 'NORMAL'}`}>{formatGrade(customer.grade)}</span> : null}
      </div>

      {customer ? (
        <dl className="call-info-grid">
          <div>
            <dt>이름</dt>
            <dd>{customer.customerName || '-'}</dd>
          </div>
          <div>
            <dt>대표번호</dt>
            <dd>{customer.primaryPhoneNumber || '-'}</dd>
          </div>
          {context?.representativeNumber ? (
            <div>
              <dt>수신 대표</dt>
              <dd>{context.representativeNumber}</dd>
            </div>
          ) : null}
          {customer.memo ? (
            <div className="call-info-grid__full">
              <dt>고객 메모</dt>
              <dd>{customer.memo}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="console-muted">등록된 고객 정보가 없습니다.</p>
      )}

      {history.length > 0 ? (
        <div className="call-history-mini">
          <h3>최근 통화</h3>
          <ul>
            {history.map((row) => (
              <li key={row.callId}>
                <span className="call-history-mini__time">{formatDateTime(row.startedAt)}</span>
                <span className="call-history-mini__direction">{row.direction === 'outbound' ? '발신' : '수신'}</span>
                <span className="call-history-mini__agent">{row.primaryAgentName ?? '-'}</span>
                <span className="call-history-mini__duration">{formatTalkSeconds(row.talkSeconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <label className="call-memo-field">
        <span>
          상담 메모
          <small className={`memo-status memo-status--${savingState}`}>
            {savingState === 'saving' ? '저장 중...' : savingState === 'saved' ? '저장됨' : savingState === 'error' ? '저장 실패' : ''}
          </small>
        </span>
        <textarea
          value={memoDraft}
          onChange={(event) => handleMemoChange(event.target.value)}
          placeholder="통화 메모를 입력하세요. 자동 저장됩니다."
          rows={3}
          disabled={!agentId}
        />
      </label>
    </section>
  );
}
