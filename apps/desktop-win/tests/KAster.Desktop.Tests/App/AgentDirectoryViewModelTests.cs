using System.Net;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 상담원 목록 서브 창. 읽는 것은 둘이다 — <b>누가 지금 받을 수 있는가</b>와 <b>내선이 몇 번인가</b>.
///
/// 상태 문구는 돌려주기 화면과 같은 것을 쓴다 (<see cref="KAster.Desktop.App.ViewModels.TransferTarget"/>).
/// 두 벌로 적으면 같은 사람이 두 화면에서 다른 상태로 보인다.
/// </summary>
public class AgentDirectoryViewModelTests : SoftphoneViewModelTestBase
{
    /// <summary>상담원 12명. 창에 다 못 들어가는 상황을 만든다.</summary>
    private static readonly string ManyAgentsJson =
        """{"success":true,"data":["""
        + string.Join(",", Enumerable.Range(1, 12).Select(n =>
            $$"""
            {"agentId":"a-{{n}}","agentName":"상담{{n}}","extension":"20{{n:00}}",
             "loginStatus":"LOGGED_IN","currentStatus":{"statusCode":"BREAK"},
             "sipRegistration":{"registered":true}
            }
            """))
        + """],"error":null}""";

    [Fact]
    public async Task Opening_lists_everyone_else_with_the_same_wording_the_transfer_screen_uses()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);

        vm.Directory.OpenCommand.Execute(null);
        await vm.PendingWork;

        // 나 자신은 뺀다. 나에게 거는 것도, 나에게 돌려주는 것도 뜻이 없다.
        Assert.DoesNotContain(vm.Directory.Rows, row => row.Extension == "1001");

        var available = Assert.Single(vm.Directory.Rows, row => row.Extension == "1002");
        Assert.Equal("이상담", available.AgentName);
        Assert.Equal("대기", available.StatusText);
        Assert.True(available.CanTakeCall);

        Assert.Equal("자리비움", Assert.Single(vm.Directory.Rows, r => r.Extension == "1003").StatusText);
        Assert.Equal("로그아웃", Assert.Single(vm.Directory.Rows, r => r.Extension == "1004").StatusText);
    }

    /// <summary>
    /// 로그인할 때 받아 둔 목록으로 "대기" 라고 보여 주면, 이미 자리를 비운 사람에게 전화를 건다.
    /// 열면서 다시 받는다.
    /// </summary>
    [Fact]
    public async Task Opening_asks_the_server_again_because_statuses_go_stale()
    {
        var (vm, _, _, stub) = await BuiltAndReady();
        var before = DirectoryLookups(stub);

        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Directory.OpenCommand.Execute(null);
        await vm.PendingWork;

        Assert.Equal(before + 1, DirectoryLookups(stub));
    }

    [Fact]
    public void Nothing_is_asked_while_the_window_is_closed()
    {
        var (vm, _, _, stub) = Build();

        for (var i = 0; i < 10; i++)
        {
            _now = _now.AddSeconds(30);
            vm.Directory.Tick();
        }

        Assert.Equal(0, DirectoryLookups(stub));
    }

    [Fact]
    public async Task Closing_the_window_stops_the_asking()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Directory.OpenCommand.Execute(null);
        await vm.PendingWork;
        var afterOpen = DirectoryLookups(stub);

        vm.Directory.Close();
        for (var i = 0; i < 5; i++)
        {
            _now = _now.AddSeconds(60);
            vm.Directory.Tick();
        }

        Assert.Equal(afterOpen, DirectoryLookups(stub));
    }

    [Fact]
    public async Task The_filter_narrows_by_name_or_extension()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Directory.OpenCommand.Execute(null);
        await vm.PendingWork;

        vm.Directory.Filter = "박";
        Assert.Equal("1003", Assert.Single(vm.Directory.Rows).Extension);

        vm.Directory.Filter = "1004";
        Assert.Equal("최상담", Assert.Single(vm.Directory.Rows).AgentName);
    }

    /// <summary>창에 스크롤을 만들지 않는다. 못 담은 인원은 숨기지 말고 숫자로 알린다.</summary>
    [Fact]
    public async Task Agents_that_do_not_fit_are_counted_instead_of_scrolled()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, ManyAgentsJson);

        vm.Directory.OpenCommand.Execute(null);
        await vm.PendingWork;

        Assert.Equal(12, vm.Directory.Rows.Count + vm.Directory.RowsHidden);
        Assert.True(vm.Directory.RowsHidden > 0);
        Assert.Equal($"외 {vm.Directory.RowsHidden}명", vm.Directory.RowsHiddenText);
    }

    /// <summary>
    /// 목록에서 바로 거는 길은 <b>발신 화면을 지나간다</b>. 발신은 PBX 가 이 단말을 먼저 부르는
    /// 방식이라, "우리가 건 전화" 표시를 세우는 곳을 지나지 않으면 방금 자기가 건 전화가
    /// 수신 전화로 뜨고 자동 응답도 안 된다.
    /// </summary>
    [Fact]
    public async Task Calling_someone_from_the_list_goes_out_through_the_dial_screen()
    {
        var (vm, _, _, stub) = await BuiltAndReady();
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Directory.OpenCommand.Execute(null);
        await vm.PendingWork;

        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.Directory.CallCommand.Execute("1002");
        await vm.PendingWork;

        Assert.Equal(
            "/api/v1/calls/originate/internal",
            stub.Requests[^1].RequestUri!.AbsolutePath);

        // 발신 화면이 "우리가 건 전화" 로 표시해 둬야 이 통화를 수신으로 착각하지 않는다.
        Assert.True(vm.Dial.IsOutboundCall);
    }

    /// <summary>못 받는 상대에게 걸면 아무도 받지 않는다. 목록에 떠 있어도 보내기 전에 한 번 더 본다.</summary>
    [Fact]
    public async Task Calling_someone_who_cannot_take_a_call_sends_nothing()
    {
        var (vm, _, _, stub) = await BuiltAndReady();
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Directory.OpenCommand.Execute(null);
        await vm.PendingWork;
        var before = stub.Requests.Count;

        vm.Directory.CallCommand.Execute("1003");
        await vm.PendingWork;

        Assert.Equal(before, stub.Requests.Count);
        Assert.NotNull(vm.NoticeMessage);
        Assert.False(vm.Dial.IsOutboundCall);
    }

    private static int Originates(StubHttpHandler stub) => stub.Requests
        .Count(r => r.RequestUri!.AbsolutePath.Contains("originate", StringComparison.Ordinal));

    /// <summary>통화 중에는 발신 자체가 열려 있지 않다. 목록에서 걸어도 마찬가지여야 한다.</summary>
    [Fact]
    public async Task Calling_from_the_list_is_refused_while_already_on_a_call()
    {
        var (vm, store, _, stub) = await BuiltAndReady();
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Directory.OpenCommand.Execute(null);
        await vm.PendingWork;

        // 통화가 붙으면 그 자리에서 대기 목록을 다시 훑는다. 답을 미리 넣어 둔다.
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":[],"error":null}""");
        store.Apply(new KAster.Desktop.Core.Contracts.CallCreatedEvent(
            Call(KAster.Desktop.Core.Contracts.SessionStatus.Talking, _now)));

        // 그 조회는 발신이 아니므로 세지 않는다.
        var before = Originates(stub);

        vm.Directory.CallCommand.Execute("1002");
        await vm.PendingWork;

        Assert.Equal(before, Originates(stub));
    }

    private async Task<(KAster.Desktop.App.ViewModels.SoftphoneViewModel Vm,
        KAster.Desktop.Core.State.CallStateStore Store,
        FakeSoftphone Phone,
        StubHttpHandler Stub)> BuiltAndReady()
    {
        var built = Build();
        await Ready(built.Vm, built.Stub);
        return built;
    }
}
