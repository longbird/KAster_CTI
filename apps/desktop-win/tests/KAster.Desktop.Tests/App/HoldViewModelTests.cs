using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 보류/해제. 서버는 feature code 를 DTMF 로 흘려보낼 뿐이라 <b>성공 여부를 모른다</b>.
/// 그래서 여기서 지켜야 하는 것은 두 가지다 — 못 하는 현장에서는 버튼을 만들지 않는 것,
/// 그리고 "명령을 보냈다" 를 "보류가 걸렸다" 로 바꿔 말하지 않는 것.
/// </summary>
public class HoldViewModelTests : SoftphoneViewModelTestBase
{
    [Fact]
    public void Hold_is_not_offered_before_the_server_says_the_pbx_can_do_it()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.False(vm.CanHold);
        Assert.False(vm.ToggleHoldCommand.CanExecute(null));
    }

    /// <summary>
    /// feature code 가 없으면 서버가 400 을 던진다. 눌러 놓고 오류를 보여 주는 대신
    /// 버튼 자체가 없어야 한다.
    /// </summary>
    [Fact]
    public async Task Hold_stays_hidden_when_the_pbx_has_no_feature_code()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub, holdEnabled: false);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.False(vm.CanHold);
        Assert.False(vm.ToggleHoldCommand.CanExecute(null));
    }

    [Fact]
    public async Task Hold_is_offered_when_both_feature_codes_are_set()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub, holdEnabled: true);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.True(vm.CanHold);
        Assert.True(vm.ToggleHoldCommand.CanExecute(null));
    }

    /// <summary>통화가 없으면 보류할 것도 없다.</summary>
    [Fact]
    public async Task Hold_is_not_offered_without_a_call()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub, holdEnabled: true);

        Assert.True(vm.CanHold);
        Assert.False(vm.ToggleHoldCommand.CanExecute(null));
    }

    /// <summary>
    /// 명령을 보낸 것과 보류가 걸린 것은 다르다. PBX 가 코드를 안 먹었을 수 있는데
    /// 화면이 먼저 "보류 중" 이 되면, 상담원은 끊긴 줄 모르는 고객 앞에서 말한다.
    /// </summary>
    [Fact]
    public async Task Pressing_hold_sends_the_command_but_does_not_claim_the_call_is_held()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub, holdEnabled: true);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.ToggleHoldAsync();

        Assert.EndsWith("/calls/c-1/hold", stub.Requests[^1].RequestUri!.AbsolutePath);
        Assert.False(vm.IsOnHold);
        Assert.True(vm.IsHoldRequestPending);
    }

    /// <summary>보류가 걸렸다는 근거는 서버가 보내 준 세션 상태뿐이다.</summary>
    [Fact]
    public async Task The_call_is_shown_as_held_only_when_the_server_says_so()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub, holdEnabled: true);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        await vm.ToggleHoldAsync();

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Hold, _now)));

        Assert.True(vm.IsOnHold);
        Assert.False(vm.IsHoldRequestPending);

        // 보류 중에도 통화 창이다. 상담원은 같은 자리에서 해제를 눌러야 한다.
        Assert.Equal(WindowMode.Talking, vm.WindowMode);
    }

    [Fact]
    public async Task A_held_call_sends_resume_instead()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub, holdEnabled: true);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Hold, _now)));
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.ToggleHoldAsync();

        Assert.EndsWith("/calls/c-1/resume", stub.Requests[^1].RequestUri!.AbsolutePath);
        Assert.True(vm.IsOnHold);
    }

    /// <summary>
    /// 서버가 접수를 거부하면 기다릴 이유가 없다. 버튼이 잠긴 채 남으면 상담원은
    /// 보류가 진행 중인 줄 안다.
    /// </summary>
    [Fact]
    public async Task A_rejected_hold_stops_waiting_at_once()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub, holdEnabled: true);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"X","message":"보류 비활성"}}""");

        await vm.ToggleHoldAsync();

        Assert.False(vm.IsHoldRequestPending);
        Assert.False(vm.IsOnHold);
        Assert.Contains("보류", vm.NoticeMessage);
    }

    /// <summary>
    /// PBX 가 코드를 안 먹으면 아무 이벤트도 안 온다. 서버는 그것을 모른다.
    /// 화면이 영원히 "보류 요청 중" 으로 남으면 상담원은 무엇을 눌러야 할지 모른다.
    /// </summary>
    [Fact]
    public async Task A_hold_the_pbx_never_confirms_stops_waiting()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub, holdEnabled: true);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        await vm.ToggleHoldAsync();

        _now = _now.AddSeconds(6);
        vm.Tick();

        Assert.False(vm.IsHoldRequestPending);
        Assert.False(vm.IsOnHold);
        Assert.Contains("보류", vm.NoticeMessage);
        Assert.True(vm.ToggleHoldCommand.CanExecute(null));
    }
}
