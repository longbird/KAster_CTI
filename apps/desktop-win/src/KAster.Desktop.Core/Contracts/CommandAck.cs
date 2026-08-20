namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 제어 명령의 접수 확인. 서버는 AMI 로 명령을 넘긴 즉시 이걸 돌려주고,
/// 실제 성공 여부는 뒤따라오는 실시간 이벤트로 판정된다.
/// </summary>
public sealed record CommandAck
{
    public bool Accepted { get; init; }
    public DateTimeOffset RequestedAt { get; init; }
    public string CorrelationId { get; init; } = string.Empty;
    public string? IdempotencyKey { get; init; }
}
