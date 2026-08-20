using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;
using KAster.Desktop.Softphone;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

internal sealed class FakeSoftphone : ISoftphoneControl
{
    public bool IsMuted { get; set; }
    public int AnswerCalls { get; private set; }
    public int HangupCalls { get; private set; }

    public Task<bool> AnswerAsync()
    {
        AnswerCalls++;
        return Task.FromResult(true);
    }

    public void Hangup() => HangupCalls++;
}

public class SoftphoneViewModelTests
{
    private const string AckJson = """
    {"success":true,"data":{"accepted":true,"requestedAt":"2026-08-20T04:00:00.000Z","correlationId":"c"},
    "error":null}
    """;

    private static readonly AgentProfile Agent = new()
    {
        AgentId = "a-1",
        AgentName = "김상담",
        Extension = "1001",
    };

    private DateTimeOffset _now = new(2026, 8, 20, 4, 0, 0, TimeSpan.Zero);

    private (SoftphoneViewModel Vm, CallStateStore Store, FakeSoftphone Phone, StubHttpHandler Stub) Build()
    {
        var stub = new StubHttpHandler();
        var store = new CallStateStore(Agent.AgentId, () => _now);
        var phone = new FakeSoftphone();
        var server = new CtiServerClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });
        return (new SoftphoneViewModel(store, server, phone, Agent, () => _now), store, phone, stub);
    }

    private static ActiveCall Call(SessionStatus status, DateTimeOffset? answeredAt = null) => new()
    {
        CallId = "c-1",
        Linkedid = "l-1",
        Ani = "01011112222",
        SessionStatus = status,
        StartedAt = new DateTimeOffset(2026, 8, 20, 4, 0, 0, TimeSpan.Zero),
        AnsweredAt = answeredAt,
        PrimaryAgentId = "a-1",
        Customer = new CustomerInfo { CustomerName = "홍길동", PhoneNumber = "01011112222" },
    };

    [Fact]
    public void Starts_in_idle()
    {
        var (vm, _, _, _) = Build();

        Assert.Equal(WindowMode.Idle, vm.WindowMode);
    }

    [Fact]
    public void Follows_the_call_from_idle_through_ringing_and_talking_and_back()
    {
        var (vm, store, _, _) = Build();
        var seen = new List<WindowMode>();
        vm.WindowModeRequested += (_, mode) => seen.Add(mode);

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));
        Assert.Equal(WindowMode.Ringing, vm.WindowMode);

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        Assert.Equal(WindowMode.Talking, vm.WindowMode);

        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended)));
        Assert.Equal(WindowMode.Idle, vm.WindowMode);

        Assert.Equal(new[] { WindowMode.Ringing, WindowMode.Talking, WindowMode.Idle }, seen);
    }

    [Fact]
    public void After_call_work_gets_its_own_window_mode()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.AfterCallWork, _now)));

        Assert.Equal(WindowMode.AfterCall, vm.WindowMode);
    }

    [Fact]
    public void A_queued_call_is_shown_as_ringing()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.Queued)));

        Assert.Equal(WindowMode.Ringing, vm.WindowMode);
    }

    [Fact]
    public void Shows_the_customer_name_and_the_number()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        Assert.Equal("홍길동", vm.CustomerName);
        Assert.Equal("01011112222", vm.PhoneNumber);
    }

    [Fact]
    public void Falls_back_to_the_number_when_the_customer_is_unknown()
    {
        var (vm, store, _, _) = Build();
        var unknown = Call(SessionStatus.RingingAgent) with { Customer = null };

        store.Apply(new CallCreatedEvent(unknown));

        Assert.Equal("알 수 없음", vm.CustomerName);
        Assert.Equal("01011112222", vm.PhoneNumber);
    }

    [Fact]
    public void The_timer_counts_from_answered_at()
    {
        var (vm, store, _, _) = Build();
        var answeredAt = _now;
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, answeredAt)));

        _now = answeredAt.AddSeconds(75);
        vm.Tick();

        Assert.Equal("01:15", vm.CallDurationText);
    }

    [Fact]
    public void The_timer_shows_zero_before_the_call_is_answered()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        _now = _now.AddSeconds(40);
        vm.Tick();

        Assert.Equal("00:00", vm.CallDurationText);
    }

    [Fact]
    public void The_timer_crosses_an_hour()
    {
        var (vm, store, _, _) = Build();
        var answeredAt = _now;
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, answeredAt)));

        _now = answeredAt.AddSeconds(3725);
        vm.Tick();

        Assert.Equal("1:02:05", vm.CallDurationText);
    }

    [Fact]
    public async Task Answering_asks_the_softphone_and_the_server()
    {
        var (vm, store, phone, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        await vm.AnswerAsync();

        Assert.Equal(1, phone.AnswerCalls);
        Assert.Equal("/api/v1/calls/c-1/answer", stub.Requests[0].RequestUri!.AbsolutePath);
    }

    [Fact]
    public async Task Hanging_up_tells_the_softphone_and_the_server()
    {
        var (vm, store, phone, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.HangupAsync();

        Assert.Equal(1, phone.HangupCalls);
        Assert.Equal("/api/v1/calls/c-1/hangup", stub.Requests[0].RequestUri!.AbsolutePath);
    }

    [Fact]
    public async Task Muting_applies_locally_and_on_the_server()
    {
        var (vm, store, phone, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.ToggleMuteAsync();

        // 로컬은 즉시 반영해야 상담원이 말을 멈춘 순간 실제로 안 나간다.
        Assert.True(phone.IsMuted);
        Assert.True(vm.IsMuted);
        Assert.Contains("\"state\":\"on\"", stub.Bodies[0]);
    }

    [Fact]
    public async Task Unmuting_sends_off()
    {
        var (vm, store, phone, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, AckJson).Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.ToggleMuteAsync();
        await vm.ToggleMuteAsync();

        Assert.False(phone.IsMuted);
        Assert.Contains("\"state\":\"off\"", stub.Bodies[1]);
    }

    [Fact]
    public async Task A_failed_server_command_surfaces_a_message_instead_of_throwing()
    {
        var (vm, store, _, stub) = Build();
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"NO_LEG","message":"상담원 leg 없음"}}""");
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.HangupAsync();

        Assert.Contains("상담원 leg 없음", vm.NoticeMessage);
    }

    [Fact]
    public async Task Changing_the_agent_status_posts_the_wire_value()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(
            HttpStatusCode.OK,
            """{"success":true,"data":{"agentId":"a-1","statusCode":"BREAK","reasonCode":null},"error":null}""");

        await vm.ChangeStatusAsync(AgentStatusCode.Break);

        Assert.Equal("/api/v1/agents/a-1/status", stub.Requests[0].RequestUri!.AbsolutePath);
        Assert.Equal(AgentStatusCode.Break, vm.AgentStatus);
    }

    [Fact]
    public void The_realtime_connection_state_is_shown()
    {
        var (vm, _, _, _) = Build();

        vm.OnConnectionStateChanged(CtiConnectionState.Connected);
        Assert.True(vm.IsConnected);

        vm.OnConnectionStateChanged(CtiConnectionState.Disconnected);
        Assert.False(vm.IsConnected);
    }
}
