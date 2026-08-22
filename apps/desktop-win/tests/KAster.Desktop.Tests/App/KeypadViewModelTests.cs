using System.Net;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using Xunit;

namespace KAster.Desktop.Tests.App;

public class KeypadViewModelTests : SoftphoneViewModelTestBase
{
    /// <summary>
    /// ARS 를 타고 들어간 곳에서 내선을 누르거나 인증번호를 넣어야 할 때가 있다.
    /// 소프트폰 모드에서는 누를 키패드가 화면에만 있다.
    /// </summary>
    [Fact]
    public void The_keypad_sends_digits_while_on_a_call()
    {
        var (vm, store, phone, _) = Build();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        vm.Keypad.SendDigitCommand.Execute("5");
        vm.Keypad.SendDigitCommand.Execute("#");

        Assert.Equal(new[] { '5', '#' }, phone.Digits);
    }

    /// <summary>소프트폰은 자기 SIP 다이얼로그로 바로 보낸다. 서버를 거치면 왕복만 늘고 늦는다.</summary>
    [Fact]
    public async Task A_softphone_does_not_ask_the_server_to_send_digits()
    {
        var (vm, store, phone, stub) = Build();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.Keypad.SendDigitAsync("7");

        Assert.Equal(new[] { '7' }, phone.Digits);
        Assert.Empty(stub.Requests);
    }

    /// <summary>
    /// 실기기는 우리에게 채널이 없다. 서버가 상담원 leg 에 넣어 줘야 상대에게 들린다.
    /// 예전에는 그 경로가 없어 키패드를 숨겼다.
    /// </summary>
    [Fact]
    public async Task A_desk_phone_sends_digits_through_the_server()
    {
        var (vm, store, phone, stub) = Build(useSoftphone: false);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.Keypad.SendDigitAsync("4");

        Assert.EndsWith("/calls/c-1/dtmf", stub.Requests[^1].RequestUri!.AbsolutePath);
        Assert.Contains("\"digits\":\"4\"", stub.Bodies[^1]);
        Assert.Empty(phone.Digits);
    }

    [Fact]
    public void The_keypad_is_offered_on_a_desk_phone_call()
    {
        var (vm, store, _, _) = Build(useSoftphone: false);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.True(vm.Keypad.ShowsKeypad);
    }

    /// <summary>실기기 모드에서 통화가 없으면 보낼 곳이 없다. 눌러도 아무 데도 안 간다.</summary>
    [Fact]
    public void The_keypad_is_not_offered_to_a_desk_phone_without_a_call()
    {
        var (vm, _, _, _) = Build(useSoftphone: false);

        Assert.False(vm.Keypad.ShowsKeypad);
    }

    [Fact]
    public void The_keypad_is_offered_on_a_softphone_call()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.True(vm.Keypad.ShowsKeypad);
    }

    /// <summary>
    /// 서버는 요청 하나에 32자리까지만 받는다. 넘겨서 400 을 받느니 화면에서 막고 말해 준다.
    /// </summary>
    [Fact]
    public async Task Digits_past_the_server_limit_never_leave_the_app()
    {
        var (vm, store, phone, stub) = Build(useSoftphone: false);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.Keypad.SendDigitAsync(new string('1', KeypadViewModel.MaxDigits + 1));

        Assert.Empty(stub.Requests);
        Assert.Empty(phone.Digits);
        Assert.Contains(KeypadViewModel.MaxDigits.ToString(), vm.NoticeMessage);
    }

    /// <summary>누른 것을 보여 준다. ARS 안에서는 무엇이 들어갔는지가 곧 다음 행동을 정한다.</summary>
    [Fact]
    public async Task What_was_sent_is_shown()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.Keypad.SendDigitAsync("1");
        await vm.Keypad.SendDigitAsync("2");

        Assert.Equal("12", vm.Keypad.EnteredDigits);
    }

    /// <summary>보내지 못한 자리는 보낸 것처럼 쌓이면 안 된다.</summary>
    [Fact]
    public async Task A_digit_the_server_refused_is_not_shown_as_sent()
    {
        var (vm, store, _, stub) = Build(useSoftphone: false);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"X","message":"통화를 찾을 수 없다"}}""");

        await vm.Keypad.SendDigitAsync("9");

        Assert.Equal(string.Empty, vm.Keypad.EnteredDigits);
        Assert.Contains("통화를 찾을 수 없다", vm.NoticeMessage);
    }

    /// <summary>
    /// 앞 통화에서 누른 것이 다음 통화 화면에 남아 있으면, 상담원은 지금 통화에서 넣은 값으로 읽는다.
    /// </summary>
    [Fact]
    public async Task The_next_call_starts_with_an_empty_keypad()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.Keypad.ToggleKeypadCommand.Execute(null);
        await vm.Keypad.SendDigitAsync("1");

        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended, _now)));
        store.Apply(new CallCreatedEvent(Call(SessionStatus.Talking, _now) with { CallId = "c-2", Linkedid = "l-2" }));

        Assert.Equal(string.Empty, vm.Keypad.EnteredDigits);
        Assert.False(vm.Keypad.IsKeypadOpen);
    }

    /// <summary>같은 통화가 갱신됐다고 열어 둔 키패드가 닫히면, 누르던 중에 화면이 사라진다.</summary>
    [Fact]
    public async Task An_update_to_the_same_call_leaves_the_keypad_alone()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.Keypad.ToggleKeypadCommand.Execute(null);
        await vm.Keypad.SendDigitAsync("1");

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.True(vm.Keypad.IsKeypadOpen);
        Assert.Equal("1", vm.Keypad.EnteredDigits);
    }
}
