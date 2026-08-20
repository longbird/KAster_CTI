using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using Xunit;

namespace KAster.Desktop.Tests.Server;

public class CtiEventParserTests
{
    [Fact]
    public void Maps_call_created_to_an_active_call_event()
    {
        var evt = CtiEventParser.Parse(CtiEventNames.CallCreated, """
        {"callId":"c-1","linkedid":"l-1","ani":"01011112222","dnis":"1588","queueName":"main",
        "sessionStatus":"RINGING_AGENT","startedAt":"2026-08-20T04:00:00.000Z"}
        """);

        var created = Assert.IsType<CallCreatedEvent>(evt);
        Assert.Equal("c-1", created.Call.CallId);
        Assert.Equal(SessionStatus.RingingAgent, created.Call.SessionStatus);
    }

    [Fact]
    public void Maps_call_updated_and_call_ended_too()
    {
        const string json = """
        {"callId":"c-1","linkedid":"l-1","sessionStatus":"ENDED",
        "startedAt":"2026-08-20T04:00:00.000Z","resultCode":"ANSWERED"}
        """;

        Assert.IsType<CallUpdatedEvent>(CtiEventParser.Parse(CtiEventNames.CallUpdated, json));
        var ended = Assert.IsType<CallEndedEvent>(CtiEventParser.Parse(CtiEventNames.CallEnded, json));
        Assert.Equal("ANSWERED", ended.Call.ResultCode);
    }

    [Fact]
    public void Maps_the_agent_status_change()
    {
        var evt = CtiEventParser.Parse(
            CtiEventNames.AgentStatusChanged,
            """{"agentId":"a-1","statusCode":"BREAK","reasonCode":"lunch"}""");

        var changed = Assert.IsType<AgentStatusChangedEvent>(evt);
        Assert.Equal(AgentStatusCode.Break, changed.Change.StatusCode);
        Assert.Equal("lunch", changed.Change.ReasonCode);
    }

    [Fact]
    public void Maps_the_queue_summary_array()
    {
        var evt = CtiEventParser.Parse(CtiEventNames.QueueSummaryUpdated, """
        [{"queueId":"q-1","queueName":"대표","waitingCount":3,"talkingCount":2,
        "availableAgents":5,"longestWaitSeconds":41}]
        """);

        var summary = Assert.IsType<QueueSummaryUpdatedEvent>(evt);
        var queue = Assert.Single(summary.Queues);
        Assert.Equal(3, queue.WaitingCount);
        Assert.Equal(41, queue.LongestWaitSeconds);
    }

    [Fact]
    public void Maps_the_screen_pop()
    {
        var evt = CtiEventParser.Parse(CtiEventNames.ScreenPopCustomer, """
        {"callId":"c-1","customer":{"customerId":"cu-1","customerName":"홍길동","grade":"VIP",
        "phoneNumber":"01011112222"}}
        """);

        var pop = Assert.IsType<ScreenPopEvent>(evt);
        Assert.Equal("c-1", pop.CallId);
        Assert.Equal("홍길동", pop.Customer!.CustomerName);
    }

    [Fact]
    public void Maps_the_announcement()
    {
        var evt = CtiEventParser.Parse(CtiEventNames.AnnouncementPushed, """
        {"action":"created","announcementId":"an-1","title":"점검 안내","body":"오늘 22시"}
        """);

        var announcement = Assert.IsType<AnnouncementPushedEvent>(evt);
        Assert.Equal("점검 안내", announcement.Title);
        Assert.Equal("created", announcement.Action);
    }

    [Fact]
    public void Unknown_event_names_return_null_instead_of_throwing()
        => Assert.Null(CtiEventParser.Parse("something.new", "{}"));

    [Fact]
    public void Malformed_payloads_return_null_instead_of_throwing()
        => Assert.Null(CtiEventParser.Parse(CtiEventNames.CallCreated, "{ broken"));

    [Fact]
    public void An_unknown_session_status_does_not_kill_the_event()
    {
        var evt = CtiEventParser.Parse(CtiEventNames.CallUpdated, """
        {"callId":"c-1","linkedid":"l-1","sessionStatus":"PARKED","startedAt":"2026-08-20T04:00:00.000Z"}
        """);

        var updated = Assert.IsType<CallUpdatedEvent>(evt);
        Assert.Equal(SessionStatus.Unknown, updated.Call.SessionStatus);
    }
}
