using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.State;
using KAster.Desktop.Tests.Server;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 설정이 <b>실제로 통화 동작을 바꾸는지</b> 본다. 저장만 되고 아무 데도 안 쓰이는 설정은
/// 없는 것보다 나쁘다 — 상담원이 값을 고쳐 놓고 왜 그대로인지 알 수 없게 된다.
/// </summary>
public class CallPreferencesInUseTests : SoftphoneViewModelTestBase
{
    private (SoftphoneViewModel Vm, CallStateStore Store, StubHttpHandler Stub) BuildWith(CallPreferences calls)
    {
        var stub = new StubHttpHandler();
        var store = new CallStateStore(Agent.AgentId, () => _now, null, Agent.Extension);
        var server = new Core.Server.CtiServerClient(
            new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });

        var vm = new SoftphoneViewModel(
            store,
            server,
            new FakeSoftphone(),
            Agent,
            () => _now,
            useSoftphone: true,
            SipConfig,
            new MemoryStore<AnnouncementReadState>(new AnnouncementReadState()),
            () => calls);

        return (vm, store, stub);
    }

    /// <summary>
    /// 자동응답 대기를 짧게 잡은 자리에서는 그 시간이 지나면 발신 중 표시가 내려가야 한다.
    /// 코드 상수 45초를 그대로 쓰고 있으면 이 시점에는 아직 발신 중이다.
    /// </summary>
    [Fact]
    public async Task A_shortened_self_answer_window_gives_up_sooner()
    {
        var (vm, _, stub) = BuildWith(new CallPreferences { SelfAnswerWindowSeconds = 10 });
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        vm.Dial.DialNumber = "1002";
        await vm.Dial.DialAsync();

        _now = _now.AddSeconds(11);
        vm.Tick();

        Assert.False(vm.Dial.IsDialing);
        Assert.Contains("전화가 오지 않았다", vm.NoticeMessage);
    }

    /// <summary>늘려 잡은 자리에서는 옛 상수(45초)가 지나도 아직 기다린다.</summary>
    [Fact]
    public async Task A_lengthened_self_answer_window_keeps_waiting()
    {
        var (vm, _, stub) = BuildWith(new CallPreferences { SelfAnswerWindowSeconds = 90 });
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        vm.Dial.DialNumber = "1002";
        await vm.Dial.DialAsync();

        _now = _now.AddSeconds(50);
        vm.Tick();

        Assert.True(vm.Dial.IsDialing);
    }

    /// <summary>
    /// PBX 응답 대기도 마찬가지다. 느린 PBX 에 맞춰 늘려 놨는데 5초에 포기하면
    /// 멀쩡히 걸린 보류에 "응답하지 않았다" 가 뜬다.
    /// </summary>
    [Fact]
    public async Task A_lengthened_pbx_wait_does_not_give_up_at_five_seconds()
    {
        var (vm, store, stub) = BuildWith(new CallPreferences { PbxResponseWaitSeconds = 20 });
        await Ready(vm, stub, holdEnabled: true);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        stub.Enqueue(HttpStatusCode.OK, AckJson);
        await vm.ToggleHoldAsync();

        _now = _now.AddSeconds(6);
        vm.Tick();
        Assert.True(vm.IsHoldRequestPending);

        _now = _now.AddSeconds(15);
        vm.Tick();
        Assert.False(vm.IsHoldRequestPending);
        Assert.Contains("응답하지 않았", vm.NoticeMessage);
    }

    /// <summary>
    /// 설정 파일은 손으로 고칠 수 있다. 말이 안 되는 값이 들어와도 통화 동작이 망가지면 안 된다 —
    /// 읽는 자리에서 좁힌다.
    /// </summary>
    [Fact]
    public async Task A_nonsense_value_in_the_file_does_not_break_dialling()
    {
        var (vm, _, stub) = BuildWith(new CallPreferences { SelfAnswerWindowSeconds = 0 });
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        vm.Dial.DialNumber = "1002";
        await vm.Dial.DialAsync();

        // 0 이 그대로 쓰였다면 이 시점에 이미 포기했을 것이다. 하한(5초)으로 좁혀져 있어야 한다.
        _now = _now.AddSeconds(3);
        vm.Tick();

        Assert.True(vm.Dial.IsDialing);
    }
}
