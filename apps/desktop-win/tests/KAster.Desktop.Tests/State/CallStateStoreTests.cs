using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.State;
using Xunit;

namespace KAster.Desktop.Tests.State;

public class CallStateStoreTests
{
    private const string MyAgentId = "a-1";
    private DateTimeOffset _now = new(2026, 8, 20, 4, 0, 0, TimeSpan.Zero);

    private CallStateStore Build() => new(MyAgentId, () => _now);

    private static ActiveCall Call(
        string callId = "c-1",
        string ani = "01011112222",
        SessionStatus status = SessionStatus.RingingAgent,
        string? agentId = MyAgentId) => new()
        {
            CallId = callId,
            Linkedid = "l-" + callId,
            Ani = ani,
            Dnis = "1588",
            SessionStatus = status,
            StartedAt = new DateTimeOffset(2026, 8, 20, 4, 0, 0, TimeSpan.Zero),
            PrimaryAgentId = agentId,
        };

    [Fact]
    public void Server_event_wins_over_the_local_sip_state()
    {
        var store = Build();
        store.OnSipIncoming("d-1", "01011112222");
        store.OnSipEstablished("d-1");

        store.Apply(new CallUpdatedEvent(Call(status: SessionStatus.Hold)));

        // 로컬 다이얼로그는 통화 중이지만 화면에 보이는 상태는 서버가 정한다.
        Assert.Equal(SessionStatus.Hold, store.Current!.Server!.SessionStatus);
        Assert.Equal(LocalSipState.Established, store.Current.Sip!.State);
    }

    [Fact]
    public void Pairs_an_incoming_invite_with_call_created_by_ani_within_the_window()
    {
        var store = Build();
        store.OnSipIncoming("d-1", "010-1111-2222");

        _now = _now.AddSeconds(2);
        store.Apply(new CallCreatedEvent(Call()));

        Assert.True(store.Current!.IsPaired);
        Assert.Equal("c-1", store.Current.Server!.CallId);
        Assert.Equal("d-1", store.Current.Sip!.DialogId);
    }

    [Fact]
    public void Pairs_when_call_created_arrives_before_the_invite()
    {
        var store = Build();
        store.Apply(new CallCreatedEvent(Call()));

        _now = _now.AddSeconds(1);
        store.OnSipIncoming("d-1", "+821011112222");

        Assert.True(store.Current!.IsPaired);
    }

    [Fact]
    public void Leaves_the_call_unpaired_when_the_ani_differs()
    {
        var store = Build();
        store.OnSipIncoming("d-1", "01099998888");

        store.Apply(new CallCreatedEvent(Call()));

        Assert.False(store.Current!.IsPaired);
        Assert.NotNull(store.Current.Server);
        Assert.NotNull(store.Current.Sip);
    }

    [Fact]
    public void Leaves_the_call_unpaired_when_the_invite_arrives_outside_the_window()
    {
        var store = Build();
        store.Apply(new CallCreatedEvent(Call()));

        _now = _now.AddSeconds(30);
        store.OnSipIncoming("d-1", "01011112222");

        Assert.False(store.Current!.IsPaired);
    }

    [Fact]
    public void Ends_the_call_on_call_ended_even_if_the_dialog_is_still_up()
    {
        var store = Build();
        store.OnSipIncoming("d-1", "01011112222");
        store.Apply(new CallCreatedEvent(Call()));
        store.OnSipEstablished("d-1");

        store.Apply(new CallEndedEvent(Call(status: SessionStatus.Ended)));

        Assert.Null(store.Current);
    }

    [Fact]
    public void Ignores_a_call_that_belongs_to_another_agent()
    {
        var store = Build();

        store.Apply(new CallCreatedEvent(Call(callId: "c-9", agentId: "a-2")));

        Assert.Null(store.Current);
    }

    [Fact]
    public void Adopts_a_queued_call_that_has_no_agent_yet()
    {
        var store = Build();

        store.Apply(new CallCreatedEvent(Call(status: SessionStatus.Queued, agentId: null)));

        Assert.Equal("c-1", store.Current!.Server!.CallId);
    }

    [Fact]
    public void Attaches_the_screen_pop_customer_to_the_current_call()
    {
        var store = Build();
        store.Apply(new CallCreatedEvent(Call()));

        store.Apply(new ScreenPopEvent("c-1", new CustomerInfo { CustomerId = "cu-1", CustomerName = "홍길동" }));

        Assert.Equal("홍길동", store.Current!.Server!.Customer!.CustomerName);
    }

    [Fact]
    public void Ignores_a_screen_pop_for_a_different_call()
    {
        var store = Build();
        store.Apply(new CallCreatedEvent(Call()));

        store.Apply(new ScreenPopEvent("c-other", new CustomerInfo { CustomerName = "다른사람" }));

        Assert.Null(store.Current!.Server!.Customer);
    }

    [Fact]
    public void Raises_the_change_event_when_the_current_call_moves()
    {
        var store = Build();
        var seen = new List<CurrentCall?>();
        store.CurrentCallChanged += (_, call) => seen.Add(call);

        store.Apply(new CallCreatedEvent(Call()));
        store.Apply(new CallUpdatedEvent(Call(status: SessionStatus.Talking)));
        store.Apply(new CallEndedEvent(Call(status: SessionStatus.Ended)));

        Assert.Equal(3, seen.Count);
        Assert.Equal(SessionStatus.Talking, seen[1]!.Server!.SessionStatus);
        Assert.Null(seen[2]);
    }

    [Fact]
    public void A_local_hangup_without_a_server_event_clears_only_the_sip_side()
    {
        var store = Build();
        store.OnSipIncoming("d-1", "01011112222");
        store.Apply(new CallCreatedEvent(Call()));

        store.OnSipEnded("d-1");

        Assert.NotNull(store.Current!.Server);
        Assert.Null(store.Current.Sip);
        Assert.False(store.Current.IsPaired);
    }
}
