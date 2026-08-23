using System.Net;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 트레이로 내려간 자리는 비어 있다. 상태를 안 바꾸면 그 자리는 큐에 남아 전화를 받고,
/// 고객은 아무도 없는 자리에서 벨소리만 듣는다. 앱을 껐다고 생각한 상담원은 모른다.
/// </summary>
public class GoAwayTests : SoftphoneViewModelTestBase
{
    private static string StatusJson(string code)
        => "{\"success\":true,\"data\":{\"agentId\":\"a-1\",\"statusCode\":\""
            + code + "\",\"reasonCode\":null},\"error\":null}";

    private static int StatusCalls(StubHttpHandler stub) => stub.Requests
        .Count(r => r.RequestUri!.AbsolutePath.Contains("/status", StringComparison.Ordinal));

    [Fact]
    public async Task Going_to_the_tray_sets_away()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, StatusJson("BREAK"));

        vm.GoAway();

        Assert.Equal(1, StatusCalls(stub));
        Assert.Contains("BREAK", stub.Bodies[^1], StringComparison.Ordinal);
    }

    /// <summary>
    /// 통화 중에는 바꾸지 않는다 — 통화 중 상태를 자리비움으로 덮으면 지금 붙어 있는 통화가
    /// 화면에서 사라진 것처럼 보인다. 대신 끝나기를 기다린다.
    /// </summary>
    [Fact]
    public async Task On_a_call_it_waits_until_the_call_ends()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallCreatedEvent(Call(SessionStatus.Talking, _now)));

        var before = StatusCalls(stub);
        vm.GoAway();
        Assert.Equal(before, StatusCalls(stub));

        stub.Enqueue(HttpStatusCode.OK, StatusJson("BREAK"));
        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended, _now)));
        vm.Tick();

        Assert.Equal(before + 1, StatusCalls(stub));
    }

    /// <summary>
    /// 창을 다시 열었으면 자리로 돌아온 것이다. 기다리던 자리비움을 그대로 두면
    /// 앉아 있는 사람을 비운 자리로 만든다.
    /// </summary>
    [Fact]
    public async Task Coming_back_cancels_a_pending_away()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallCreatedEvent(Call(SessionStatus.Talking, _now)));

        vm.GoAway();
        vm.CameBack();

        var before = StatusCalls(stub);
        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended, _now)));
        vm.Tick();

        Assert.Equal(before, StatusCalls(stub));
    }

    /// <summary>돌아왔다고 스스로 대기로 바꾸지 않는다. 창만 열어 두고 자리를 뜰 수 있다.</summary>
    [Fact]
    public async Task Coming_back_does_not_make_the_seat_available_on_its_own()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);

        var before = StatusCalls(stub);
        vm.CameBack();

        Assert.Equal(before, StatusCalls(stub));
    }
}
