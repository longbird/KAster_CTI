using KAster.Desktop.Core.Contracts;

namespace KAster.Desktop.App.ViewModels;

/// <summary>공지 한 줄. 제목·본문과 "언제 누가" 한 줄, 그리고 안 읽은 것인지.</summary>
public sealed record AnnouncementRow(
    string AnnouncementId,
    string Title,
    string Body,
    string Meta,
    bool Pinned,
    bool IsUnread)
{
    public static AnnouncementRow From(Announcement announcement, Func<DateTimeOffset> now, bool isUnread)
        => new(
            announcement.AnnouncementId,
            announcement.Title.Trim(),
            announcement.Body.Trim(),
            FormatMeta(announcement, now),
            announcement.Pinned,
            isUnread);

    /// <summary>고정 공지는 위에 붙어 계속 남는다. 그 사실을 안 적으면 왜 이것이 맨 위인지 알 수 없다.</summary>
    public string TitleLine => Pinned ? $"[고정] {Title}" : Title;

    /// <summary>오늘 올라온 것은 시각만, 그 전은 날짜까지. 지난 통화 목록과 같은 규칙이다.</summary>
    private static string FormatMeta(Announcement announcement, Func<DateTimeOffset> now)
    {
        var author = announcement.AuthorName.Trim();
        var when = announcement.CreatedAt is { } at
            ? at.ToLocalTime() is var local && local.Date == now().ToLocalTime().Date
                ? local.ToString("HH:mm")
                : local.ToString("MM-dd HH:mm")
            : string.Empty;

        // 없는 쪽은 아예 빼고 잇는다. 빈 자리를 구분자로 채우면 없는 정보가 있는 것처럼 보인다.
        return string.Join(" · ", new[] { author, when }.Where(part => part.Length > 0));
    }
}
