import { useCallback, useEffect, useState } from 'react';
import type { DesktopCallerIdConfig } from '../../../shared/ipc';

const KEYS: ReadonlyArray<{ value: string; label: string; sub?: string }> = [
  { value: '1', label: '1' },
  { value: '2', label: '2', sub: 'ABC' },
  { value: '3', label: '3', sub: 'DEF' },
  { value: '4', label: '4', sub: 'GHI' },
  { value: '5', label: '5', sub: 'JKL' },
  { value: '6', label: '6', sub: 'MNO' },
  { value: '7', label: '7', sub: 'PQRS' },
  { value: '8', label: '8', sub: 'TUV' },
  { value: '9', label: '9', sub: 'WXYZ' },
  { value: '*', label: '*' },
  { value: '0', label: '0', sub: '+' },
  { value: '#', label: '#' },
];

const ALLOWED_INPUT_CHARS = /^[0-9*#+]+$/;

function sanitizeNumber(input: string): string {
  return input.replace(/[^0-9*#+]/g, '');
}

export function DialpadPopup() {
  const [number, setNumber] = useState('');
  const [callerIds, setCallerIds] = useState<string[]>([]);
  const [selectedCallerId, setSelectedCallerId] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const desktopApi =
        typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
      if (!desktopApi?.getCallerIds) {
        return;
      }

      try {
        const config: DesktopCallerIdConfig = await desktopApi.getCallerIds();
        if (!alive) return;
        setCallerIds(config.callerIds ?? []);
        setSelectedCallerId(
          config.defaultCallerId ?? config.callerIds?.[0] ?? '',
        );
      } catch {
        if (alive) {
          setCallerIds([]);
          setSelectedCallerId('');
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleAppend = useCallback((digit: string) => {
    setNumber((current) => current + digit);
    setErrorMessage(null);
    setStatus(null);
  }, []);

  const handleBackspace = useCallback(() => {
    setNumber((current) => current.slice(0, -1));
    setErrorMessage(null);
    setStatus(null);
  }, []);

  const handleClear = useCallback(() => {
    setNumber('');
    setErrorMessage(null);
    setStatus(null);
  }, []);

  const handleDial = useCallback(async () => {
    const trimmed = sanitizeNumber(number);
    if (trimmed.length === 0) {
      setErrorMessage('번호를 입력하세요.');
      return;
    }

    const desktopApi =
      typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
    if (!desktopApi) {
      setErrorMessage('데스크톱 IPC 를 사용할 수 없습니다.');
      return;
    }

    setPending(true);
    setErrorMessage(null);
    setStatus(null);
    try {
      const result = await desktopApi.requestHistoryOriginate({ phoneNumber: trimmed });
      if (!result.ok) {
        throw new Error(result.message ?? '발신 요청 실패');
      }
      setStatus(result.message ?? `${trimmed} 발신 요청 완료`);
      setNumber('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '발신 요청 실패');
    } finally {
      setPending(false);
    }
  }, [number]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        void handleDial();
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClear();
        return;
      }
      if (event.key.length === 1 && ALLOWED_INPUT_CHARS.test(event.key)) {
        event.preventDefault();
        handleAppend(event.key);
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [handleAppend, handleBackspace, handleClear, handleDial]);

  return (
    <main className="popup-layout dialpad-popup-layout">
      <header className="popup-header">
        <div>
          <h1>발신 키패드</h1>
          <p>{status ?? '번호를 입력하고 발신을 누르세요.'}</p>
        </div>
      </header>

      <section className="dialpad-display-row">
        <select
          aria-label="발신번호"
          value={selectedCallerId}
          onChange={(event) => setSelectedCallerId(event.target.value)}
          disabled={callerIds.length === 0}
          className="dialpad-caller-id"
        >
          {callerIds.length === 0 ? <option value="">등록된 발신번호 없음</option> : null}
          {callerIds.map((callerId) => (
            <option key={callerId} value={callerId}>
              {callerId}
            </option>
          ))}
        </select>
        <input
          aria-label="발신 번호"
          className="dialpad-display"
          value={number}
          onChange={(event) => setNumber(sanitizeNumber(event.target.value))}
          placeholder="번호 입력"
        />
      </section>

      <section className="dialpad-grid" aria-label="키패드">
        {KEYS.map((key) => (
          <button
            type="button"
            key={key.value}
            className="dialpad-key"
            onClick={() => handleAppend(key.value)}
            aria-label={`키 ${key.value}`}
          >
            <span className="dialpad-key__label">{key.label}</span>
            {key.sub ? <span className="dialpad-key__sub">{key.sub}</span> : null}
          </button>
        ))}
      </section>

      <section className="dialpad-actions">
        <button
          type="button"
          className="dialpad-secondary"
          onClick={handleBackspace}
          disabled={number.length === 0}
          aria-label="한 자리 지우기"
        >
          ⌫
        </button>
        <button
          type="button"
          className="primary-button dialpad-call"
          onClick={() => void handleDial()}
          disabled={pending || number.length === 0}
          aria-label="발신"
        >
          {pending ? '발신 중' : '📞 발신'}
        </button>
        <button
          type="button"
          className="dialpad-secondary"
          onClick={handleClear}
          disabled={number.length === 0}
          aria-label="모두 지우기"
        >
          C
        </button>
      </section>

      {errorMessage ? <p className="dial-error console-muted">{errorMessage}</p> : null}
    </main>
  );
}
