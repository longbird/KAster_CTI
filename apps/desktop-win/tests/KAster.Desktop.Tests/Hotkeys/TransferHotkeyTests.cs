using KAster.Desktop.App.Services;
using Xunit;

/// <summary>
/// 통화 중 1~9 로 미리 정해 둔 자리에 바로 넘긴다. 상담원이 하루에 수십 번 하는 동작이라
/// 목록을 열어 고르는 것과 키 하나의 차이가 크다.
///
/// 그런데 통화 중 숫자는 <b>ARS 입력(DTMF)</b>도 쓰는 자리다. 지금 이 앱의 키패드는 버튼뿐이라
/// 부딪히지 않지만, 글자를 치고 있는 칸에서까지 가로채면 번호를 못 적는다.
/// </summary>
public class TransferHotkeyTests
{
    private static readonly TransferHotkeySettings Slots = new()
    {
        Slots = new[]
        {
            new TransferHotkeySlot { Slot = 1, Label = "팀장", Target = "2001", Mode = TransferHotkeyMode.Attended },
            new TransferHotkeySlot { Slot = 3, Label = "지사", Target = "3301", Mode = TransferHotkeyMode.Blind },
        },
    };

    private static TransferHotkeySlot? Resolve(
        int digit,
        WindowMode mode = WindowMode.Talking,
        bool typing = false,
        bool modifier = false)
        => TransferHotkeys.Resolve(Slots.Sane().Slots, digit, mode, typing, modifier);

    [Fact]
    public void A_configured_digit_picks_its_slot()
    {
        Assert.Equal("2001", Resolve(1)!.Target);
        Assert.Equal(TransferHotkeyMode.Attended, Resolve(1)!.Mode);
        Assert.Equal("3301", Resolve(3)!.Target);
    }

    [Fact]
    public void An_unassigned_digit_does_nothing()
    {
        Assert.Null(Resolve(2));
        Assert.Null(Resolve(9));
    }

    /// <summary>통화 중일 때만이다. 대기 화면에서 숫자를 눌렀다고 전화를 넘기면 안 된다.</summary>
    [Fact]
    public void Only_during_a_call()
    {
        Assert.NotNull(Resolve(1, WindowMode.Talking));
        Assert.NotNull(Resolve(1, WindowMode.Transferring));

        Assert.Null(Resolve(1, WindowMode.Idle));
        Assert.Null(Resolve(1, WindowMode.Ringing));
        Assert.Null(Resolve(1, WindowMode.AfterCall));
        Assert.Null(Resolve(1, WindowMode.Settings));
    }

    /// <summary>번호를 적고 있는 칸에서 1 을 누른 것은 전환 지시가 아니다.</summary>
    [Fact]
    public void Not_while_typing()
    {
        Assert.Null(Resolve(1, typing: true));
    }

    /// <summary>Ctrl+1 같은 것은 다른 뜻이다. 조합키가 눌려 있으면 우리 것이 아니다.</summary>
    [Fact]
    public void Not_with_a_modifier()
    {
        Assert.Null(Resolve(1, modifier: true));
    }

    // --- 저장된 값 정리 ---

    /// <summary>대상이 비어 있으면 없는 것과 같다. 눌렀을 때 아무 데도 안 걸리는 편이 낫다.</summary>
    [Fact]
    public void A_slot_without_a_target_is_dropped()
    {
        var sane = new TransferHotkeySettings
        {
            Slots = new[] { new TransferHotkeySlot { Slot = 1, Target = "  " } },
        }.Sane();

        Assert.Empty(sane.Slots);
    }

    [Fact]
    public void Slots_outside_one_to_nine_are_dropped()
    {
        var sane = new TransferHotkeySettings
        {
            Slots = new[]
            {
                new TransferHotkeySlot { Slot = 0, Target = "2001" },
                new TransferHotkeySlot { Slot = 10, Target = "2001" },
                new TransferHotkeySlot { Slot = 5, Target = "2001" },
            },
        }.Sane();

        Assert.Single(sane.Slots);
        Assert.Equal(5, sane.Slots[0].Slot);
    }

    /// <summary>같은 숫자가 둘이면 어느 것이 걸릴지 사람이 알 수 없다. 처음 것만 남긴다.</summary>
    [Fact]
    public void A_duplicated_digit_keeps_the_first()
    {
        var sane = new TransferHotkeySettings
        {
            Slots = new[]
            {
                new TransferHotkeySlot { Slot = 2, Target = "2001" },
                new TransferHotkeySlot { Slot = 2, Target = "3301" },
            },
        }.Sane();

        Assert.Single(sane.Slots);
        Assert.Equal("2001", sane.Slots[0].Target);
    }

    /// <summary>대상은 전화번호 자리다. 아무 문자열이나 그대로 PBX 로 보내지 않는다.</summary>
    [Fact]
    public void A_target_that_is_not_dialable_is_dropped()
    {
        var sane = new TransferHotkeySettings
        {
            Slots = new[] { new TransferHotkeySlot { Slot = 1, Target = "2001; rm -rf" } },
        }.Sane();

        Assert.Empty(sane.Slots);
    }
}
