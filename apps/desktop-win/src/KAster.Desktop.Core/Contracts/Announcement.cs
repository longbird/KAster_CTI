namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 공지 한 건. 서버 <c>GET announcements</c> 가 대상 앱과 게시 기간을 이미 걸러 주고
/// 고정 공지를 위로 올려 정렬해 준다 — 클라이언트가 다시 거르거나 다시 정렬하지 않는다.
///
/// WS <c>announcement.pushed</c> 의 본문은 이 형이 아니다. 수정 이벤트일 때 관리자가 보낸
/// 필드만 실려 와 매 요청마다 구성이 달라진다. 그래서 그쪽은 재조회 신호로만 쓴다.
/// </summary>
public sealed record Announcement
{
    public string AnnouncementId { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string Body { get; init; } = string.Empty;
    public string AuthorName { get; init; } = string.Empty;

    /// <summary>고정 공지. 서버가 이 값으로 먼저 정렬해서 내려준다.</summary>
    public bool Pinned { get; init; }

    public string Category { get; init; } = "NOTICE";

    /// <summary><c>INFO</c> / <c>WARN</c> / <c>CRITICAL</c>.</summary>
    public string Severity { get; init; } = "INFO";

    public DateTimeOffset? CreatedAt { get; init; }
}
