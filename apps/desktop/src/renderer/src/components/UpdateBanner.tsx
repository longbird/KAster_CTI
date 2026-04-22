export function UpdateBanner({
  message,
  canApply,
  busy,
  readyFileName,
  onPrepare,
  onApply,
}: {
  message: string;
  canApply: boolean;
  busy: boolean;
  readyFileName?: string | null;
  onPrepare: () => void;
  onApply: () => void;
}) {
  return (
    <div className="update-banner">
      <div className="update-banner-copy">
        <strong>{message}</strong>
        <span>{canApply ? '지금 적용 가능' : '통화 종료 후 적용'}</span>
        {readyFileName ? <span>다운로드 완료: {readyFileName}</span> : null}
      </div>
      <div className="update-banner-actions">
        <button type="button" disabled={busy} onClick={onPrepare}>
          {busy ? '준비 중...' : readyFileName ? '다시 준비' : '업데이트 준비'}
        </button>
        <button type="button" disabled={!readyFileName || !canApply || busy} onClick={onApply}>
          설치 실행
        </button>
      </div>
    </div>
  );
}
