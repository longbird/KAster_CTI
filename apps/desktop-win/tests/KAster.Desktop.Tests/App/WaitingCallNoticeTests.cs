using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.State;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 큐에 새 전화가 들어왔다는 것을 상담원이 알아야 한다. 화면을 안 보고 있어도.
///
/// <b>통화 중에도 알아야 한다.</b> 예전에는 통화 중이면 큐를 아예 안 봤다 — 당겨받을 수
/// 없으니 목록도 비웠고, 그래서 새로 들어온 전화를 알 길이 없었다. 목록을 <b>보여 주는 것</b>과
/// <b>아는 것</b>은 다르다. 당겨받기 보호는 당기는 자리로 옮겼다.
/// </summary>
public class WaitingCallNoticeTests : SoftphoneViewModelTestBase
{
    private const string QueuedJson = """
    {"success":true,"data":[
      {"callId":"q-1","linkedid":"lq-1","ani":"01034623453","sessionStatus":"QUEUED",
       "startedAt":"2026-08-20T04:00:00.000Z","queueName":"기본","primaryAgentId":null}
    ],"error":null}
    """;

    /// <summary>남이 받아 갔다. 더 이상 기다리지 않으므로 목록에서도 빠진다.</summary>
    private const string TakenJson = """
    {"success":true,"data":[
      {"callId":"q-1","linkedid":"lq-1","ani":"01034623453","sessionStatus":"TALKING",
       "startedAt":"2026-08-20T04:00:00.000Z","queueName":"기본","primaryAgentId":"a-9"}
    ],"error":null}
    """;

    private const string EmptyJson = """{"success":true,"data":[],"error":null}""";

    private readonly List<Alert> _alerts = new();
    private int _dismissals;

    private async Task<(SoftphoneViewModel Vm, CallStateStore Store, StubHttpHandler Stub)> Signed()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        vm.AttentionRequested += (_, alert) => _alerts.Add(alert);
        vm.AttentionDismissed += (_, _) => _dismissals++;
        return (vm, store, stub);
    }

    private static async Task Look(SoftphoneViewModel vm, StubHttpHandler stub, string json)
    {
        stub.Enqueue(HttpStatusCode.OK, json);
        await vm.Waiting.RefreshWaitingCallsAsync();
    }

    [Fact]
    public async Task A_new_queued_call_raises_a_balloon()
    {
        var (vm, _, stub) = await Signed();

        await Look(vm, stub, QueuedJson);

        Assert.Single(_alerts);
        Assert.Contains("010-3462-3453", _alerts[0].Body, StringComparison.Ordinal);
    }

    /// <summary>같은 전화가 계속 기다린다고 5초마다 울리면 상담원이 알림을 꺼 버린다.</summary>
    [Fact]
    public async Task The_same_call_does_not_ring_again()
    {
        var (vm, _, stub) = await Signed();

        await Look(vm, stub, QueuedJson);
        await Look(vm, stub, QueuedJson);

        Assert.Single(_alerts);
        Assert.Equal(0, _dismissals);
    }

    /// <summary>남이 받아 갔다. 띄워 둔 알림은 지난 전화가 되므로 내린다.</summary>
    [Fact]
    public async Task An_alert_is_taken_down_when_someone_else_takes_the_call()
    {
        var (vm, _, stub) = await Signed();

        await Look(vm, stub, QueuedJson);
        await Look(vm, stub, TakenJson);

        Assert.Equal(1, _dismissals);
    }

    /// <summary>고객이 끊어 목록에서 사라져도 마찬가지다.</summary>
    [Fact]
    public async Task An_alert_is_taken_down_when_the_call_ends()
    {
        var (vm, _, stub) = await Signed();

        await Look(vm, stub, QueuedJson);
        await Look(vm, stub, EmptyJson);

        Assert.Equal(1, _dismissals);
    }

    /// <summary>내릴 것이 없으면 내리라고 하지 않는다. 트레이 아이콘을 괜히 껐다 켜게 된다.</summary>
    [Fact]
    public async Task Nothing_to_take_down_stays_quiet()
    {
        var (vm, _, stub) = await Signed();

        await Look(vm, stub, EmptyJson);
        await Look(vm, stub, EmptyJson);

        Assert.Equal(0, _dismissals);
    }

    /// <summary>이 테스트가 이 파일의 요지다. 통화 중이라 못 당기더라도 큐는 봐야 한다.</summary>
    [Fact]
    public async Task It_still_looks_while_on_a_call()
    {
        var (vm, store, stub) = await Signed();
        store.Apply(new CallCreatedEvent(Call(SessionStatus.Talking, _now)));
        Assert.Equal(WindowMode.Talking, vm.WindowMode);

        await Look(vm, stub, QueuedJson);

        Assert.Single(_alerts);
        Assert.Single(vm.Waiting.WaitingCalls);
    }

    /// <summary>
    /// 보던 것과 당기는 것은 다르다. 통화 중에 남의 전화를 당기면 지금 붙어 있는 통화와
    /// 새 통화를 함께 놓친다. 예전에는 목록을 비워 막았고, 이제는 여기서 막는다.
    /// </summary>
    [Fact]
    public async Task It_refuses_to_pick_up_while_on_a_call()
    {
        var (vm, store, stub) = await Signed();
        await Look(vm, stub, QueuedJson);
        store.Apply(new CallCreatedEvent(Call(SessionStatus.Talking, _now)));

        var before = stub.Requests.Count;
        await vm.Waiting.PickupAsync(vm.Waiting.WaitingCalls[0]);

        Assert.Equal(before, stub.Requests.Count);
    }
}
