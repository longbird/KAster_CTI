using KAster.Desktop.App.Services;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 전역 핫키. 상담원이 다른 프로그램을 보고 있어도 받기·끊기가 먹어야 한다.
///
/// <b>조용히 실패하면 안 된다.</b> 다른 프로그램이 이미 쓰는 조합이면 등록이 거부되는데,
/// 그것을 말하지 않으면 상담원은 핫키가 되는 줄 알고 누르고 전화는 계속 울린다.
/// </summary>
public sealed class HotkeyPlanTests
{
    [Fact]
    public void The_defaults_are_all_readable()
    {
        var plan = HotkeyPlan.For(new HotkeySettings());

        Assert.All(plan, item => Assert.Null(item.Error));
        Assert.All(plan, item => Assert.NotNull(item.Binding));
    }

    /// <summary>받기와 끊기가 없으면 전역 핫키를 붙일 이유 자체가 없다.</summary>
    [Fact]
    public void Answering_and_hanging_up_are_always_in_the_plan()
    {
        var plan = HotkeyPlan.For(new HotkeySettings());

        Assert.Contains(plan, item => item.Action == HotkeyAction.Answer);
        Assert.Contains(plan, item => item.Action == HotkeyAction.Hangup);
    }

    /// <summary>
    /// 수식키 없는 조합은 거부한다. "F9" 를 전역으로 잡으면 상담원이 다른 프로그램에서
    /// 그 키를 영영 못 쓴다 — 전화 앱이 남의 키를 가져가는 셈이다.
    /// </summary>
    [Fact]
    public void A_bare_key_is_refused_with_a_reason()
    {
        var plan = HotkeyPlan.For(new HotkeySettings { Answer = "F9" });
        var answer = plan.Single(item => item.Action == HotkeyAction.Answer);

        Assert.Null(answer.Binding);
        Assert.NotNull(answer.Error);
        Assert.Contains("F9", answer.Error);
    }

    [Fact]
    public void Nonsense_is_refused_with_a_reason()
    {
        var answer = HotkeyPlan.For(new HotkeySettings { Answer = "Ctrl+없는키" })
            .Single(item => item.Action == HotkeyAction.Answer);

        Assert.Null(answer.Binding);
        Assert.NotNull(answer.Error);
    }

    /// <summary>비워 둔 것은 "이 동작에는 핫키를 안 쓴다" 는 뜻이다. 오류로 띄우면 매번 시끄럽다.</summary>
    [Fact]
    public void An_empty_combination_is_a_choice_not_a_mistake()
    {
        var answer = HotkeyPlan.For(new HotkeySettings { Answer = "  " })
            .Single(item => item.Action == HotkeyAction.Answer);

        Assert.Null(answer.Binding);
        Assert.Null(answer.Error);
    }

    /// <summary>설정 파일은 사람이 손으로 고친다. 띄어쓰기와 대소문자로 안 먹으면 안 된다.</summary>
    [Fact]
    public void Spacing_and_case_do_not_matter()
    {
        var loose = HotkeyPlan.For(new HotkeySettings { Answer = " ctrl + shift + f9 " })
            .Single(item => item.Action == HotkeyAction.Answer);
        var tight = HotkeyPlan.For(new HotkeySettings { Answer = "Ctrl+Shift+F9" })
            .Single(item => item.Action == HotkeyAction.Answer);

        Assert.Equal(tight.Binding, loose.Binding);
    }

    /// <summary>
    /// 수식키 비트는 Win32 <c>RegisterHotKey</c> 가 그대로 받는 값이어야 한다.
    /// 우리가 임의로 번호를 매기면 등록은 성공하는데 엉뚱한 조합이 잡힌다.
    /// </summary>
    [Fact]
    public void The_modifier_bits_are_the_ones_windows_expects()
    {
        var binding = HotkeyPlan.For(new HotkeySettings { Answer = "Ctrl+Shift+F9" })
            .Single(item => item.Action == HotkeyAction.Answer).Binding;

        Assert.NotNull(binding);
        Assert.Equal(HotkeyModifiers.Control | HotkeyModifiers.Shift, binding!.Modifiers);
        Assert.Equal(0x02u | 0x04u, (uint)binding.Modifiers);

        // VK_F9
        Assert.Equal(0x78u, binding.VirtualKey);
    }

    /// <summary>
    /// 같은 조합을 두 동작에 넣으면 윈도우는 둘째 등록을 거부한다. 그것을 그대로 두면
    /// 상담원은 끊기 핫키가 안 먹는 이유를 알 수 없다 — 계획 단계에서 말해 준다.
    /// </summary>
    [Fact]
    public void The_same_combination_twice_is_caught_before_windows_refuses_it()
    {
        var plan = HotkeyPlan.For(new HotkeySettings
        {
            Answer = "Ctrl+Shift+F9",
            Hangup = "Ctrl+Shift+F9",
        });

        Assert.NotNull(plan.Single(item => item.Action == HotkeyAction.Answer).Binding);

        var hangup = plan.Single(item => item.Action == HotkeyAction.Hangup);
        Assert.Null(hangup.Binding);
        Assert.NotNull(hangup.Error);
    }

    /// <summary>실패 문구에 어느 동작인지가 없으면 상담원은 무엇이 안 먹는지 모른다.</summary>
    [Fact]
    public void A_failure_names_the_action_in_words_the_agent_uses()
    {
        var answer = HotkeyPlan.For(new HotkeySettings { Answer = "F9" })
            .Single(item => item.Action == HotkeyAction.Answer);

        Assert.Equal("받기", answer.Label);
    }

    /// <summary>거부 문구에 조합이 없으면 상담원은 무엇을 바꿔야 하는지 모른다.</summary>
    [Fact]
    public void A_refusal_says_which_action_and_which_combination()
    {
        var answer = HotkeyPlan.For(new HotkeySettings()).Single(item => item.Action == HotkeyAction.Answer);

        var message = HotkeyNotice.Refused(answer);

        Assert.Contains("받기", message);
        Assert.Contains("Ctrl+Shift+F9", message);
    }

    [Fact]
    public void Nothing_failed_means_nothing_to_say()
    {
        Assert.Null(HotkeyNotice.For(Array.Empty<string>()));
    }

    /// <summary>화면 알림 자리는 하나뿐이다. 둘째 실패가 첫째를 덮으면 안 된다.</summary>
    [Fact]
    public void Two_failures_are_shown_together()
    {
        var message = HotkeyNotice.For(new[] { "받기 실패", "끊기 실패" });

        Assert.NotNull(message);
        Assert.Contains("받기 실패", message);
        Assert.Contains("끊기 실패", message);
    }
}
