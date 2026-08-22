using System.Net;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 큐 대기 현황 서브 창.
///
/// 두 가지가 이 화면의 전부다 — <b>창이 닫혀 있으면 아무것도 물어보지 않는다</b>는 것과,
/// <b>WS 는 다시 조회하라는 신호로만 쓴다</b>는 것. 후자를 어기면 REST 와 WS 의 필드명이
/// 달라(REST <c>waiting</c> ↔ WS <c>waitingCount</c>) 한쪽이 바뀔 때 다른 쪽이 조용히 어긋난다.
/// </summary>
public class QueueStatusViewModelTests : SoftphoneViewModelTestBase
{
    private static string SummaryJson(int waiting, string status = "WAITING") => $$"""
    {"success":true,"data":{"queues":[
      {"queueId":"q-1","queueName":"main","queueDisplayName":"대표","queueExten":"600",
       "waiting":{{waiting}},"ringing":1,"talking":2,"available":4,"paused":1,
       "longestWaitSeconds":95,
       "virtualBuffer":{"waitingCalls":{{waiting}},"longestWaitSeconds":95,
                        "overThresholdCalls":0,"status":"{{status}}"},
       "recentAnswered":10,"recentAbandoned":2}
    ]},"error":null}
    """;

    /// <summary>큐 9개. 창에 다 못 들어가는 상황을 만든다.</summary>
    private static readonly string ManyQueuesJson =
        """{"success":true,"data":{"queues":["""
        + string.Join(",", Enumerable.Range(1, 9).Select(n =>
            $$"""
            {"queueId":"q-{{n}}","queueName":"q{{n}}","queueDisplayName":"큐{{n}}","queueExten":"60{{n}}",
             "waiting":{{n}},"ringing":0,"talking":0,"available":1,"paused":0,"longestWaitSeconds":{{n}},
             "virtualBuffer":{"waitingCalls":{{n}},"longestWaitSeconds":{{n}},"overThresholdCalls":0,
                              "status":"WAITING"},
             "recentAnswered":0,"recentAbandoned":0}
            """))
        + """]},"error":null}""";

    private static int SummaryLookups(StubHttpHandler stub)
        => stub.Requests.Count(r => r.RequestUri!.AbsolutePath.EndsWith("/queues/summary", StringComparison.Ordinal));

    [Fact]
    public async Task Opening_lists_what_the_server_reports_for_each_queue()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SummaryJson(waiting: 3));

        vm.Queues.OpenCommand.Execute(null);
        await vm.PendingWork;

        var row = Assert.Single(vm.Queues.Rows);
        Assert.Equal("대표", row.QueueName);
        Assert.Equal(3, row.Waiting);
        Assert.Equal(1, row.Ringing);
        Assert.Equal(2, row.Talking);
        Assert.Equal(4, row.Available);
        Assert.Equal(1, row.Paused);
        Assert.Equal("1분 35초", row.LongestWaitText);
        Assert.False(row.IsOverThreshold);
    }

    /// <summary>창이 닫혀 있는데 조회가 돌면, 아무도 안 보는 화면 때문에 서버가 계속 두들겨 맞는다.</summary>
    [Fact]
    public void Nothing_is_asked_while_the_window_is_closed()
    {
        var (vm, _, _, stub) = Build();

        for (var i = 0; i < 10; i++)
        {
            _now = _now.AddSeconds(10);
            vm.Queues.Tick();
        }

        Assert.Equal(0, SummaryLookups(stub));
    }

    [Fact]
    public async Task An_open_window_asks_again_on_its_own()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SummaryJson(waiting: 3));
        vm.Queues.OpenCommand.Execute(null);
        await vm.PendingWork;

        stub.Enqueue(HttpStatusCode.OK, SummaryJson(waiting: 7));
        _now = _now.AddSeconds(30);
        vm.Queues.Tick();
        await vm.PendingWork;

        Assert.Equal(2, SummaryLookups(stub));
        Assert.Equal(7, vm.Queues.Rows[0].Waiting);
    }

    /// <summary>상담원이 창을 닫았다. 그 뒤로도 조회가 돌면 닫은 뜻이 없다.</summary>
    [Fact]
    public async Task Closing_the_window_stops_the_asking()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SummaryJson(waiting: 3));
        vm.Queues.OpenCommand.Execute(null);
        await vm.PendingWork;

        vm.Queues.Close();

        for (var i = 0; i < 5; i++)
        {
            _now = _now.AddSeconds(30);
            vm.Queues.Tick();
        }

        Assert.Equal(1, SummaryLookups(stub));
    }

    /// <summary>
    /// WS 페이로드는 REST 와 필드명이 다르다. 그것을 읽어 화면에 넣으면 두 벌의 파싱이 생기고,
    /// 한쪽이 바뀔 때 다른 쪽이 조용히 어긋난다. 이벤트는 "다시 물어보라"는 신호로만 쓴다.
    /// </summary>
    [Fact]
    public async Task A_pushed_summary_only_makes_it_ask_again_and_its_own_numbers_never_reach_the_screen()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SummaryJson(waiting: 3));
        vm.Queues.OpenCommand.Execute(null);
        await vm.PendingWork;

        vm.Apply(new QueueSummaryUpdatedEvent(new[]
        {
            new QueueSummaryItem { QueueId = "q-1", QueueName = "밀어 넣은 이름", WaitingCount = 99 },
        }));

        // 이벤트 하나로 화면이 바뀌지 않는다. 바뀌는 것은 다음 조회 시점뿐이다.
        Assert.Equal(3, vm.Queues.Rows[0].Waiting);
        Assert.Equal("대표", vm.Queues.Rows[0].QueueName);

        stub.Enqueue(HttpStatusCode.OK, SummaryJson(waiting: 7));
        vm.Queues.Tick();
        await vm.PendingWork;

        Assert.Equal(2, SummaryLookups(stub));
        Assert.Equal(7, vm.Queues.Rows[0].Waiting);
        Assert.Equal("대표", vm.Queues.Rows[0].QueueName);
    }

    [Fact]
    public void A_push_that_arrives_while_the_window_is_closed_asks_for_nothing()
    {
        var (vm, _, _, stub) = Build();

        vm.Apply(new QueueSummaryUpdatedEvent(new[]
        {
            new QueueSummaryItem { QueueId = "q-1", WaitingCount = 99 },
        }));
        _now = _now.AddSeconds(30);
        vm.Queues.Tick();

        Assert.Equal(0, SummaryLookups(stub));
    }

    /// <summary>창에 스크롤을 만들지 않는다. 넘치는 큐는 숨기지 말고 숫자로 알린다.</summary>
    [Fact]
    public async Task Queues_that_do_not_fit_are_counted_instead_of_scrolled()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, ManyQueuesJson);

        vm.Queues.OpenCommand.Execute(null);
        await vm.PendingWork;

        Assert.Equal(9, vm.Queues.Rows.Count + vm.Queues.RowsHidden);
        Assert.True(vm.Queues.RowsHidden > 0);
        Assert.Equal($"외 {vm.Queues.RowsHidden}개 큐", vm.Queues.RowsHiddenText);

        // 잘려도 급한 큐가 남아야 한다. 대기가 많은 순으로 온다.
        Assert.Equal(9, vm.Queues.Rows[0].Waiting);
    }

    /// <summary>대기 시간이 임계값을 넘긴 큐는 눈에 띄어야 한다. 그것 하나 때문에 창을 여는 것이다.</summary>
    [Fact]
    public async Task A_queue_past_its_threshold_is_marked()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SummaryJson(waiting: 3, status: "OVER_THRESHOLD"));

        vm.Queues.OpenCommand.Execute(null);
        await vm.PendingWork;

        Assert.True(vm.Queues.Rows[0].IsOverThreshold);
    }

    /// <summary>대기가 없으면 "가장 오래 기다린 시간" 은 뜻이 없다. 지난 통화의 값을 남겨 두면 거짓말이 된다.</summary>
    [Fact]
    public async Task An_empty_queue_shows_no_wait_time()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SummaryJson(waiting: 0, status: "EMPTY"));

        vm.Queues.OpenCommand.Execute(null);
        await vm.PendingWork;

        Assert.Equal(string.Empty, vm.Queues.Rows[0].LongestWaitText);
    }

    /// <summary>조회가 실패했다고 화면에 오류를 계속 띄우면 통화 알림이 묻힌다.</summary>
    [Fact]
    public async Task A_failed_refresh_stays_quiet_and_keeps_what_was_on_screen()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SummaryJson(waiting: 3));
        vm.Queues.OpenCommand.Execute(null);
        await vm.PendingWork;

        stub.Enqueue(HttpStatusCode.InternalServerError, """{"success":false,"data":null,"error":{"message":"터졌다"}}""");
        _now = _now.AddSeconds(30);
        vm.Queues.Tick();
        await vm.PendingWork;

        Assert.Null(vm.NoticeMessage);
        Assert.Equal(3, vm.Queues.Rows[0].Waiting);
    }
}
