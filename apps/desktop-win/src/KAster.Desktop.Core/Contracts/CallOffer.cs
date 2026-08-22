namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 큐가 상담원에게 넘기기 전에 물어보는 호.
///
/// 이걸 수락해야 전화기가 연결된다. 그 전까지 고객은 큐에서 대기음을 듣고 있다 —
/// 상담원이 고민하는 동안 고객이 무음을 듣지 않는다.
/// </summary>
public sealed record CallOffer
{
    /// <summary>이 제안 한 건을 가리키는 값. 수락·거절할 때 서버가 이것으로 찾는다.</summary>
    public string OfferId { get; init; } = string.Empty;

    /// <summary>PBX 가 통화 전체에 유지하는 식별자.</summary>
    public string Linkedid { get; init; } = string.Empty;

    /// <summary>제안받는 상담원 내선. 남의 제안은 화면에 띄우지 않는다.</summary>
    public string Extension { get; init; } = string.Empty;

    /// <summary>고객 번호. 발신번호 표시제한이면 비어 온다.</summary>
    public string? Caller { get; init; }

    /// <summary>이 시간 안에 안 누르면 다음 상담원에게 넘어간다.</summary>
    public int TimeoutSeconds { get; init; }
}
