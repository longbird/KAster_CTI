namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 지난 통화 한 건. 서버 <c>GET calls/history</c> 가 훨씬 많은 필드를 주지만
/// 상담원이 화면에서 읽는 것은 이만큼이다 — 언제, 누구와, 얼마나, 받았는지.
/// </summary>
public sealed record CallHistoryEntry
{
    public string CallId { get; init; } = string.Empty;

    public DateTimeOffset? StartedAt { get; init; }

    /// <summary><c>inbound</c> / <c>outbound</c> / <c>internal</c>. 서버가 대문자로 줄 때도 있다.</summary>
    public string? Direction { get; init; }

    /// <summary>발신자 번호.</summary>
    public string? Ani { get; init; }

    /// <summary>착신 번호.</summary>
    public string? Dnis { get; init; }

    public int? TalkSeconds { get; init; }

    /// <summary>비어 있지 않으면 못 받은 통화다.</summary>
    public string? MissedReason { get; init; }
}
