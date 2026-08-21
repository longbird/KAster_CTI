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

    /// <summary>
    /// 큐에서 기다리는 통화는 아직 아무에게도 배정되지 않았다. 그걸 자기 전화로 띄우면
    /// 모든 상담원 화면이 같은 통화로 덮이고, 정작 당겨받을 목록에서는 사라진다.
    /// </summary>
    [Fact]
    public void A_call_waiting_in_the_queue_belongs_to_nobody_yet()
    {
        var store = Build();

        store.Apply(new CallCreatedEvent(Call(status: SessionStatus.Queued, agentId: null)));

        Assert.Null(store.Current);
    }

    /// <summary>
    /// 발신은 서버가 primaryAgentId 를 채우지 않는다. 배정된 사람이 없다고 전부 버리면
    /// 자기가 건 전화가 화면에 안 뜬다. 우리가 걸었다고 알려 준 동안만 받는다.
    /// </summary>
    [Fact]
    public void A_call_we_just_placed_is_ours_even_before_it_is_assigned()
    {
        var store = Build();
        store.ExpectOutboundCall(TimeSpan.FromSeconds(45));

        store.Apply(new CallCreatedEvent(Call(status: SessionStatus.RingingAgent, agentId: null)));

        Assert.NotNull(store.Current);
    }

    /// <summary>
    /// 발신이 실패해 아무 통화도 안 왔으면 그 기대는 끝나야 한다. 남겨 두면 한참 뒤
    /// 큐에 들어온 남의 전화가 우리 화면을 차지한다.
    /// </summary>
    [Fact]
    public void The_expectation_runs_out_so_a_later_call_is_not_taken()
    {
        var store = Build();
        store.ExpectOutboundCall(TimeSpan.FromSeconds(45));

        _now = _now.AddSeconds(46);
        store.Apply(new CallCreatedEvent(Call(status: SessionStatus.RingingAgent, agentId: null)));

        Assert.Null(store.Current);
    }

    /// <summary>이미 들고 있는 통화의 갱신은 배정 여부와 무관하게 받는다.</summary>
    [Fact]
    public void Updates_to_the_call_we_hold_keep_arriving()
    {
        var store = Build();
        store.ExpectOutboundCall(TimeSpan.FromSeconds(45));
        store.Apply(new CallCreatedEvent(Call(status: SessionStatus.RingingAgent, agentId: null)));

        _now = _now.AddSeconds(60);
        store.Apply(new CallUpdatedEvent(Call(status: SessionStatus.Talking, agentId: null)));

        Assert.Equal(SessionStatus.Talking, store.Current!.Server!.SessionStatus);
    }
}
