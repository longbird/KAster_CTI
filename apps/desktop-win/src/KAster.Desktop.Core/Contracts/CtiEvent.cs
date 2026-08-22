namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 서버가 <c>/ws</c> 로 밀어 주는 이벤트. 원전은 <c>apps/server/src/modules/realtime/realtime-events.ts</c>.
/// </summary>
public abstract record CtiEvent
{
    public abstract string Name { get; }
}

public sealed record CallCreatedEvent(ActiveCall Call) : CtiEvent
{
    public override string Name => CtiEventNames.CallCreated;
}

public sealed record CallUpdatedEvent(ActiveCall Call) : CtiEvent
{
    public override string Name => CtiEventNames.CallUpdated;
}

public sealed record CallEndedEvent(ActiveCall Call) : CtiEvent
{
    public override string Name => CtiEventNames.CallEnded;
}

public sealed record ScreenPopEvent(string CallId, CustomerInfo? Customer) : CtiEvent
{
    public override string Name => CtiEventNames.ScreenPopCustomer;
}

public sealed record AgentStatusChangedEvent(AgentStatusChange Change) : CtiEvent
{
    public override string Name => CtiEventNames.AgentStatusChanged;
}

public sealed record QueueSummaryUpdatedEvent(IReadOnlyList<QueueSummaryItem> Queues) : CtiEvent
{
    public override string Name => CtiEventNames.QueueSummaryUpdated;
}

public sealed record AnnouncementPushedEvent(
    string AnnouncementId,
    string Title,
    string Body,
    string? Action) : CtiEvent
{
    public override string Name => CtiEventNames.AnnouncementPushed;
}

public sealed record QueueSummaryItem
{
    public string QueueId { get; init; } = string.Empty;
    public string QueueName { get; init; } = string.Empty;
    public int WaitingCount { get; init; }
    public int TalkingCount { get; init; }
    public int AvailableAgents { get; init; }
    public int LongestWaitSeconds { get; init; }
}

/// <summary>수락하면 전화기가 연결된다. 안 누르면 시간이 지나 다음 상담원에게 넘어간다.</summary>
public sealed record CallOfferedEvent(CallOffer Offer) : CtiEvent
{
    public override string Name => CtiEventNames.CallOffered;
}

/// <summary>
/// 제안이 끝났다. 다른 상담원이 받았거나 시간이 지났다.
/// 안 내리면 이미 끝난 통화의 수락 버튼이 남아 상담원이 그걸 누르게 된다.
/// </summary>
public sealed record CallOfferClosedEvent(string OfferId, string Extension, string Decision) : CtiEvent
{
    public override string Name => CtiEventNames.CallOfferClosed;
}

public static class CtiEventNames
{
    public const string CallOffered = "agent.offer";
    public const string CallOfferClosed = "agent.offer.closed";
    public const string CallCreated = "call.created";
    public const string CallUpdated = "call.updated";
    public const string CallEnded = "call.ended";
    public const string ScreenPopCustomer = "screenpop.customer";
    public const string AgentStatusChanged = "agent.status.changed";
    public const string QueueSummaryUpdated = "queue.summary.updated";
    public const string AnnouncementPushed = "announcement.pushed";

    public static readonly IReadOnlyList<string> All = new[]
    {
        CallCreated,
        CallUpdated,
        CallEnded,
        ScreenPopCustomer,
        AgentStatusChanged,
        QueueSummaryUpdated,
        AnnouncementPushed,
        CallOffered,
        CallOfferClosed,
    };
}
