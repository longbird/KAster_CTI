export function UpdateBanner({
  message,
  canApply,
  statusText,
  busy,
  readyFileName,
  onPrepare,
  onApply,
  onDismiss,
}: {
  message: string;
  canApply: boolean;
  statusText: string;
  busy: boolean;
  readyFileName?: string | null;
  onPrepare: () => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="update-banner">
      <div className="update-banner-copy">
        <strong>{message}</strong>
        <span>{statusText}</span>
        {readyFileName ? <span>다운로드 완료: {readyFileName}</span> : null}
      </div>
      <div className="update-banner-actions">
        <button type="button" disabled={busy} onClick={onPrepare}>
          {busy ? '준비 중...' : readyFileName ? '다시 준비' : '업데이트 준비'}
        </button>
        <button type="button" disabled={!readyFileName || !canApply || busy} onClick={onApply}>
          설치 실행
        </button>
        <button type="button" className="icon-button" aria-label="업데이트 알림 숨기기" onClick={onDismiss}>
          ×
        </button>
      </div>
    </div>
  );
}
