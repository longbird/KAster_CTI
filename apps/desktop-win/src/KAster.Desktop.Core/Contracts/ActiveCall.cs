namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 진행 중인 통화 세션. 서버 <c>GET calls/active</c> 와 <c>call.created</c> / <c>call.updated</c> 이벤트가 같은 모양을 쓴다.
/// </summary>
public sealed record ActiveCall
{
    public required string CallId { get; init; }
    public required string Linkedid { get; init; }
    public string Ani { get; init; } = string.Empty;
    public string Dnis { get; init; } = string.Empty;
    public string QueueName { get; init; } = string.Empty;
    public SessionStatus SessionStatus { get; init; }
    public DateTimeOffset StartedAt { get; init; }
    public DateTimeOffset? QueuedAt { get; init; }
    public DateTimeOffset? AnsweredAt { get; init; }
    public string? PrimaryAgentId { get; init; }
    public string? ResultCode { get; init; }
    public bool? IsMuted { get; init; }
    public CustomerInfo? Customer { get; init; }
}

public sealed record CustomerInfo
{
    public string CustomerId { get; init; } = string.Empty;
    public string CustomerName { get; init; } = string.Empty;
    public string Grade { get; init; } = "NORMAL";
    public string PhoneNumber { get; init; } = string.Empty;
    public string? CompanyName { get; init; }
    public string? Memo { get; init; }
}
