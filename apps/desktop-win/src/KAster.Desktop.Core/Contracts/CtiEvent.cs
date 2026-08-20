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

public static class CtiEventNames
{
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
    };
}
