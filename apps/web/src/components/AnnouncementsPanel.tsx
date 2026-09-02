import type { Announcement } from '../types/cti';

function formatNoticeTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AnnouncementsPanel({
  announcements,
  compact = false,
}: {
  announcements: Announcement[];
  compact?: boolean;
}) {
  if (announcements.length === 0) {
    return null;
  }

  const pinned = announcements.filter((item) => item.pinned);
  const regular = announcements.filter((item) => !item.pinned);
  const visible = [...pinned, ...regular].slice(0, compact ? 2 : 4);

  return (
    <section className={`k-panel ${compact ? 'p-3' : 'p-5'}`} aria-label="공지사항">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--fg-1)]">공지사항</h3>
        <span className="k-eyebrow">{announcements.length}건</span>
      </div>
      <div className="space-y-2">
        {visible.map((item) => (
          <article
            key={item.announcementId}
            className={`rounded-md border p-3 ${
              item.pinned
                ? 'border-[var(--signal-dim)] bg-[var(--signal-soft)]'
                : 'border-[var(--line-1)] bg-[var(--bg-2)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {item.pinned ? (
                    <span className="rounded-sm border border-[var(--signal-dim)] px-1.5 py-0.5 text-micro font-semibold text-[var(--signal)]">
                      고정
                    </span>
                  ) : null}
                  <h4 className="truncate text-sm font-semibold text-[var(--fg-1)]">{item.title}</h4>
                </div>
                <p className={`${compact ? 'line-clamp-2' : ''} mt-2 text-xs leading-5 text-[var(--fg-2)]`}>
                  {item.body}
                </p>
              </div>
              <time className="shrink-0 text-micro text-[var(--fg-3)]" dateTime={item.createdAt}>
                {formatNoticeTime(item.createdAt)}
              </time>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
