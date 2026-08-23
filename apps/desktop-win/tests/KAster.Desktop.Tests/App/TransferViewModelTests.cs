using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;
using Xunit;

namespace KAster.Desktop.Tests.App;

public class TransferViewModelTests : SoftphoneViewModelTestBase
{
    /// <summary>
    /// 돌려주기는 통화 중에만 뜻이 있다. 대기 중에 눌리면 아무 통화도 없이
    /// 대상 선택 화면이 떠서 상담원이 헤맨다.
    /// </summary>
    [Fact]
    public void Transfer_is_only_offered_while_on_a_call()
    {
        var (vm, store, _, _) = Build();
        Assert.False(vm.Transfer.StartTransferCommand.CanExecute(null));

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.True(vm.Transfer.StartTransferCommand.CanExecute(null));
    }

    [Fact]
    public async Task Transfer_targets_are_colleagues_not_myself()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        vm.Transfer.StartTransferCommand.Execute(null);

        Assert.True(vm.Transfer.IsChoosingTransferTarget);
        Assert.Contains(vm.Transfer.TransferTargets, t => t.Extension == "1002");
        Assert.DoesNotContain(vm.Transfer.TransferTargets, t => t.Extension == "1001");
    }

    /// <summary>사람이 많으면 창에 다 들어가지 않는다. 창에 스크롤을 만들지 않는다.</summary>
    [Fact]
    public async Task Typing_narrows_the_transfer_list()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.Transfer.StartTransferCommand.Execute(null);

        vm.Transfer.TransferFilter = "1002";

        Assert.All(vm.Transfer.TransferTargets, t => Assert.Contains("1002", t.Extension));
    }

    [Fact]
    public async Task Transferring_sends_the_target_and_my_own_extension()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Transfer.StartTransferCommand.Execute(null);
        await vm.PendingWork;
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.Transfer.TransferToAsync("1002");

        var last = stub.Requests[^1];
        Assert.Equal("/api/v1/calls/c-1/transfer", last.RequestUri!.AbsolutePath);
        Assert.Contains("\"transferType\":\"blind\"", stub.Bodies[^1]);
        Assert.Contains("\"target\":\"1002\"", stub.Bodies[^1]);
        Assert.Contains("\"fromExtension\":\"1001\"", stub.Bodies[^1]);
    }

    [Fact]
    public async Task Cancelling_the_target_pick_goes_back_to_the_call()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.Transfer.StartTransferCommand.Execute(null);

        vm.Transfer.CancelTransferCommand.Execute(null);

        Assert.False(vm.Transfer.IsChoosingTransferTarget);
        Assert.Equal(WindowMode.Talking, vm.WindowMode);
    }

    /// <summary>
    /// 상대가 받을 수 있는 상태인지 모르고 돌려주면 통화가 허공으로 간다.
    /// 발신자는 그 사이 기다리다 끊는다.
    /// </summary>
    [Fact]
    public async Task Transfer_targets_show_what_each_person_is_doing()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.Transfer.StartTransferCommand.Execute(null);

        var byExtension = vm.Transfer.TransferTargets.ToDictionary(t => t.Extension);

        Assert.Equal("대기", byExtension["1002"].StatusText);
        Assert.Equal("자리비움", byExtension["1003"].StatusText);
        Assert.Equal("로그아웃", byExtension["1004"].StatusText);
    }

    [Fact]
    public async Task Someone_who_cannot_take_a_call_is_marked_so()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.Transfer.StartTransferCommand.Execute(null);

        var byExtension = vm.Transfer.TransferTargets.ToDictionary(t => t.Extension);

        Assert.True(byExtension["1002"].CanTakeCall);
        Assert.False(byExtension["1003"].CanTakeCall);
        Assert.False(byExtension["1004"].CanTakeCall);
    }

    /// <summary>
    /// 상태는 낡는다. 로그인할 때 받아 둔 목록으로 "대기" 라고 보여 주면 이미 자리를 비운
    /// 사람에게 돌려주게 된다. 목록을 열 때마다 다시 받는다.
    /// </summary>
    [Fact]
    public async Task Opening_the_transfer_list_asks_for_fresh_status()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        var before = DirectoryLookups(stub);
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);

        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Transfer.StartTransferCommand.Execute(null);
        await vm.PendingWork;

        Assert.Equal(before + 1, DirectoryLookups(stub));
    }

    /// <summary>
    /// 못 받는 상대에게 넘기면 통화가 그대로 끊어진다. 발신자는 아무 설명 없이 끊기고,
    /// 상담원은 넘겼다고 믿는다. 보여 주기만 해서는 부족하고 막아야 한다.
    /// </summary>
    [Fact]
    public async Task Transferring_to_someone_who_cannot_answer_is_refused()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Transfer.StartTransferCommand.Execute(null);
        await vm.PendingWork;
        var before = stub.Requests.Count;

        await vm.Transfer.TransferToAsync("1003");

        Assert.Equal(before, stub.Requests.Count);
        Assert.Contains("1003", vm.NoticeMessage);
        Assert.True(vm.Transfer.IsChoosingTransferTarget);
    }

    /// <summary>목록에 없는 내선으로는 넘기지 않는다. 오타 하나로 통화가 끊어진다.</summary>
    [Fact]
    public async Task Transferring_to_an_unknown_extension_is_refused()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Transfer.StartTransferCommand.Execute(null);
        await vm.PendingWork;
        var before = stub.Requests.Count;

        await vm.Transfer.TransferToAsync("9999");

        Assert.Equal(before, stub.Requests.Count);
    }

    /// <summary>받을 수 있는 사람이 위로 온다. 목록이 잘려도 쓸 수 있는 쪽이 남는다.</summary>
    [Fact]
    public async Task People_who_can_answer_come_first()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.Transfer.StartTransferCommand.Execute(null);

        Assert.Equal("1002", vm.Transfer.TransferTargets[0].Extension);
    }
}
