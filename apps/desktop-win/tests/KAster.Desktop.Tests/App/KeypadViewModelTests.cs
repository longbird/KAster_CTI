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

    /// <summary>실기기 모드에서는 전화기 키패드가 진짜다. 화면 키패드는 아무 데도 안 간다.</summary>
    [Fact]
    public void The_keypad_is_not_offered_on_a_desk_phone()
    {
        var (vm, store, _, _) = Build(useSoftphone: false);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.False(vm.Keypad.ShowsKeypad);
    }

    [Fact]
    public void The_keypad_is_offered_on_a_softphone_call()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.True(vm.Keypad.ShowsKeypad);
    }
}
