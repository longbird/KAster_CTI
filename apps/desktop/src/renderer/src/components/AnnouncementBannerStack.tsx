import type { AnnouncementBanner } from '../store/useDesktopStore';

function formatReceived(receivedAt: string): string {
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function AnnouncementBannerStack({
  announcements,
  onDismiss,
}: {
  announcements: AnnouncementBanner[];
  onDismiss: (announcementId: string) => void;
}) {
  if (announcements.length === 0) return null;

  return (
    <div className="announcement-stack" role="region" aria-label="공지사항">
      {announcements.map((item) => (
        <div
          key={item.announcementId}
          className={`announcement-banner${item.pinned ? ' announcement-banner--pinned' : ''}`}
          role="alert"
        >
          <div className="announcement-banner__head">
            <span className="announcement-banner__badge">
              {item.pinned ? '📌 고정' : '공지'}
            </span>
            <span className="announcement-banner__title">{item.title}</span>
            <span className="announcement-banner__meta">
              {item.authorName ?? ''} {formatReceived(item.receivedAt)}
            </span>
            <button
              type="button"
              className="announcement-banner__close"
              aria-label="공지 닫기"
              onClick={() => onDismiss(item.announcementId)}
            >
              ×
            </button>
          </div>
          {item.body ? <div className="announcement-banner__body">{item.body}</div> : null}
        </div>
      ))}
    </div>
  );
}
