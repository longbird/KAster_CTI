using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.State;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 전역 핫키가 부르는 동작. 상담원이 다른 프로그램에 상담 내용을 적는 동안에도 받기·끊기가 먹어야 한다.
///
/// <b>핫키는 화면의 버튼과 같은 것을 눌러야 한다.</b> 다르게 동작하면 눈으로 본 것과 손으로 누른
/// 결과가 어긋나고, 그 어긋남은 통화 중에 드러난다.
/// </summary>
public sealed class SoftphoneHotkeyTests : SoftphoneViewModelTestBase
{
    private static CallOfferedEvent Offered()
        => new(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001",
            Caller = "01034623453", TimeoutSeconds = 10,
        });

    /// <summary>
    /// 제안이 떠 있을 때 화면에 있는 것은 "받기" 가 아니라 "수락" 이다. 이때 받기 핫키가
    /// 서버의 당겨받기를 부르면 아직 연결되지도 않은 통화를 가로채려다 거부당한다.
    /// </summary>
    [Fact]
    public async Task Answering_while_an_offer_is_up_accepts_that_offer()
    {
        var (vm, store, phone, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(Offered());

        vm.Invoke(HotkeyAction.Answer);
        await vm.PendingWork;

        Assert.Equal("/api/v1/client/call-commands/offer/decision", stub.Requests[^1].RequestUri!.AbsolutePath);
        Assert.Contains("\"decision\":\"ACCEPT\"", stub.Bodies[^1]);
        Assert.Equal(0, phone.AnswerCalls);
    }

    /// <summary>제안 화면의 반대쪽 버튼은 "거절" 이다. 끊기 핫키도 그것을 눌러야 한다.</summary>
    [Fact]
    public async Task Hanging_up_while_an_offer_is_up_rejects_that_offer()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(Offered());

        vm.Invoke(HotkeyAction.Hangup);
        await vm.PendingWork;

        Assert.Contains("\"decision\":\"REJECT\"", stub.Bodies[^1]);
        Assert.False(vm.Offer.HasOffer);
    }

    [Fact]
    public async Task Answering_a_ringing_call_answers_it()
    {
        var (vm, store, phone, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.RingingAgent)));

        vm.Invoke(HotkeyAction.Answer);

        Assert.Equal(1, phone.AnswerCalls);
    }

    /// <summary>
    /// 누를 수 없는 버튼을 핫키가 우회하면 안 된다. 대기 중에 끊기가 나가면 옆자리 통화가
    /// 끊기거나, 아무 통화도 없는데 서버에 명령이 간다.
    /// </summary>
    [Fact]
    public async Task A_hotkey_never_does_what_the_button_refuses()
    {
        var (vm, _, phone, stub) = Build();
        await Ready(vm, stub);
        var before = stub.Requests.Count;

        vm.Invoke(HotkeyAction.Hangup);
        vm.Invoke(HotkeyAction.Answer);
        vm.Invoke(HotkeyAction.ToggleMute);

        Assert.Equal(before, stub.Requests.Count);
        Assert.Equal(0, phone.HangupCalls);
        Assert.Equal(0, phone.AnswerCalls);
    }

    /// <summary>
    /// 옆자리와 이야기하려고 창을 찾아 올리는 동안 고객에게 다 들린다. 통화 중에는 창을 안 보고도
    /// 마이크를 꺼야 한다.
    /// </summary>
    [Fact]
    public async Task The_microphone_can_be_cut_without_looking_at_the_window()
    {
        var (vm, store, phone, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":{},"error":null}""");
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        vm.Invoke(HotkeyAction.ToggleMute);

        Assert.True(vm.IsMuted);
        Assert.True(phone.IsMuted);
    }
}
