namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 큐 대기 현황. 서버 <c>GET queues/summary</c> 의 응답 본문이다.
///
/// <b>WS <c>queue.summary.updated</c> 와 같은 형이 아니다.</b> 그쪽은 필드명이 다르고
/// (<c>waitingCount</c> ↔ <c>waiting</c>) 담긴 값도 적다. 화면이 읽는 것은 이 REST 한 갈래뿐이고,
/// WS 는 다시 물어보라는 신호로만 쓴다 — 두 벌로 파싱하면 한쪽이 바뀔 때 다른 쪽이 조용히 어긋난다.
/// </summary>
public sealed record QueueSummaryResponse
{
    public IReadOnlyList<QueueStatusRow> Queues { get; init; } = Array.Empty<QueueStatusRow>();
}

public sealed record QueueStatusRow
{
    public string QueueId { get; init; } = string.Empty;
    public string QueueName { get; init; } = string.Empty;

    /// <summary>사람이 붙인 이름. 없으면 <see cref="QueueName"/> 이 화면에 온다.</summary>
    public string? QueueDisplayName { get; init; }

    public string? QueueExten { get; init; }
    public int Waiting { get; init; }
    public int Ringing { get; init; }
    public int Talking { get; init; }
    public int Available { get; init; }
    public int Paused { get; init; }

    /// <summary>가장 오래 기다리는 통화의 대기 시간. 대기가 없으면 0 이다.</summary>
    public int LongestWaitSeconds { get; init; }

    public QueueVirtualBuffer? VirtualBuffer { get; init; }
}

/// <summary>
/// 큐에 쌓인 대기가 관리자가 정한 한계를 넘었는지. 창을 여는 이유가 대개 이것 하나다.
/// </summary>
public sealed record QueueVirtualBuffer
{
    public int WaitingCalls { get; init; }
    public int LongestWaitSeconds { get; init; }
    public int OverThresholdCalls { get; init; }

    /// <summary><c>EMPTY</c> / <c>WAITING</c> / <c>OVER_THRESHOLD</c>.</summary>
    public string Status { get; init; } = "EMPTY";
}
