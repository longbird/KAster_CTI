using System.Net;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

public class WaitingCallsViewModelTests : SoftphoneViewModelTestBase
{
    /// <summary>대기 8건. 화면에 다 못 들어가는 상황을 만든다.</summary>
    private static readonly string ManyWaitingJson =
        """{"success":true,"data":["""
        + string.Join(",", Enumerable.Range(1, 8).Select(n =>
            $$"""{"callId":"c-{{n}}","linkedid":"l-{{n}}","ani":"0105555000{{n}}","sessionStatus":"QUEUED","startedAt":"2026-08-20T04:00:00.000Z","primaryAgentId":null}"""))
        + """],"error":null}""";

    private const string WaitingCallsJson = """
    {"success":true,"data":[
      {"callId":"c-9","linkedid":"l-9","ani":"01055556666","sessionStatus":"QUEUED",
       "startedAt":"2026-08-20T04:00:00.000Z","queueName":"대표","primaryAgentId":null},
      {"callId":"c-1","linkedid":"l-1","ani":"01011112222","sessionStatus":"TALKING",
       "startedAt":"2026-08-20T04:00:00.000Z","primaryAgentId":"a-2"}
    ],"error":null}
    """;

    /// <summary>
    /// 옆자리에 울리는 전화를 당겨받으려면 그런 전화가 있다는 것부터 보여야 한다.
    /// 이미 통화 중인 건은 당길 수 없으므로 목록에 넣지 않는다.
    /// </summary>
    [Fact]
    public async Task Only_calls_that_can_still_be_picked_up_are_listed()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, WaitingCallsJson);

        await vm.Waiting.RefreshWaitingCallsAsync();

        var waiting = Assert.Single(vm.Waiting.WaitingCalls);
        Assert.Equal("c-9", waiting.CallId);
        Assert.Equal("010-5555-6666", waiting.PhoneNumber);
    }

    [Fact]
    public async Task Picking_one_up_asks_the_server_for_that_call()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, WaitingCallsJson);
        await vm.Waiting.RefreshWaitingCallsAsync();
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.Waiting.PickupAsync(vm.Waiting.WaitingCalls[0]);

        Assert.Equal("/api/v1/calls/c-9/pickup", stub.Requests[1].RequestUri!.AbsolutePath);
    }

    /// <summary>
    /// 통화 중이어도 대기 목록은 그대로 본다. 로그인해 있으면 어떤 상태에서도 큐를 볼 수 있어야 한다.
    ///
    /// 예전에는 여기서 목록을 비웠고, 그것이 "통화 중에는 못 당긴다" 를 대신하고 있었다.
    /// 그 보호는 당기는 자리로 옮겼다 — <see cref="WaitingCallNoticeTests"/> 가 지킨다.
    /// </summary>
    [Fact]
    public async Task The_list_stays_while_this_agent_is_on_a_call()
    {
        var (vm, store, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, WaitingCallsJson);
        await vm.Waiting.RefreshWaitingCallsAsync();
        Assert.NotEmpty(vm.Waiting.WaitingCalls);

        // 통화가 붙으면 화면이 다시 훑는다. 그 조회에도 답이 있어야 한다.
        stub.Enqueue(HttpStatusCode.OK, WaitingCallsJson);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.NotEmpty(vm.Waiting.WaitingCalls);
    }

    /// <summary>
    /// 대기가 한두 건일 때는 목록이 읽기 좋고, 쌓이면 타일이 한눈에 들어온다.
    /// 자리마다 선호가 달라 고를 수 있어야 한다.
    /// </summary>
    [Fact]
    public void The_waiting_list_starts_as_a_list()
    {
        var (vm, _, _, _) = Build();

        Assert.Equal(WaitingCallLayout.List, vm.Waiting.WaitingLayout);
        Assert.True(vm.Waiting.ShowsWaitingAsList);
        Assert.False(vm.Waiting.ShowsWaitingAsTile);
    }

    [Fact]
    public void The_screen_can_switch_to_tiles()
    {
        var (vm, _, _, _) = Build();

        vm.Waiting.SetWaitingLayoutCommand.Execute("tile");

        Assert.Equal(WaitingCallLayout.Tile, vm.Waiting.WaitingLayout);
        Assert.False(vm.Waiting.ShowsWaitingAsList);
        Assert.True(vm.Waiting.ShowsWaitingAsTile);
    }

    /// <summary>타일은 한 줄에 둘씩 들어가므로 같은 높이에 더 담긴다.</summary>
    [Fact]
    public async Task Tiles_show_more_calls_than_the_list_does()
    {
        var (vm, _, _, stub) = Build();
        stub.RespondWith(_ => StubHttpHandler.Json(HttpStatusCode.OK, ManyWaitingJson));

        await vm.Waiting.RefreshWaitingCallsAsync();
        var asList = vm.Waiting.WaitingCalls.Count;

        vm.Waiting.WaitingLayout = WaitingCallLayout.Tile;
        await vm.Waiting.RefreshWaitingCallsAsync();

        Assert.True(vm.Waiting.WaitingCalls.Count > asList, $"타일 {vm.Waiting.WaitingCalls.Count} > 목록 {asList} 이어야 한다");
    }

    /// <summary>못 보여 준 건수는 숨기지 않는다. 대기가 더 있는데 없는 줄 알면 안 된다.</summary>
    [Fact]
    public async Task The_calls_that_did_not_fit_are_counted_out_loud()
    {
        var (vm, _, _, stub) = Build();
        stub.RespondWith(_ => StubHttpHandler.Json(HttpStatusCode.OK, ManyWaitingJson));

        await vm.Waiting.RefreshWaitingCallsAsync();

        Assert.True(vm.Waiting.WaitingCallsHidden > 0);
        Assert.Contains("외", vm.Waiting.WaitingCallsHiddenText);
    }

    /// <summary>조회가 실패했다고 화면에 오류를 띄우면 통화 알림이 묻힌다.</summary>
    [Fact]
    public async Task A_failed_lookup_stays_quiet()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.InternalServerError, """{"success":false,"data":null,"error":{"code":"X","message":"서버 오류"}}""");

        await vm.Waiting.RefreshWaitingCallsAsync();

        Assert.Null(vm.NoticeMessage);
        Assert.Empty(vm.Waiting.WaitingCalls);
    }
}
