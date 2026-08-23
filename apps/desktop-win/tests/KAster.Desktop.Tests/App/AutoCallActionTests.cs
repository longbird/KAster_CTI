using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 현장에 따라 전화를 자동으로 받거나(헤드셋을 끼고 하루 종일 받는 자리) 자동으로 끊는다.
///
/// <b>제안(수락/거절)에는 절대 걸지 않는다.</b> 그건 "이 호를 받으시겠습니까" 를 사람에게
/// 묻는 자리다. 거기에 자동 수락을 붙이면 자리를 비운 상담원에게도 전화가 꽂히고,
/// 고객은 아무도 없는 자리에서 무음을 듣는다.
/// </summary>
public class AutoCallActionTests
{
    private static CallPreferences Prefs(int answer = 0, int reject = 0, int available = 0)
        => new CallPreferences
        {
            AutoAnswerSeconds = answer,
            AutoRejectSeconds = reject,
            AutoAvailableAfterCallSeconds = available,
        }.Sane();

    private static AutoCallAction Ringing(
        CallPreferences prefs, int seconds, bool hasOffer = false, bool outbound = false)
        => AutoCallActions.WhileRinging(prefs, hasOffer, outbound, TimeSpan.FromSeconds(seconds));

    [Fact]
    public void Off_by_default()
    {
        Assert.Equal(AutoCallAction.None, Ringing(Prefs(), 300));
        Assert.False(AutoCallActions.ShouldReturnToAvailable(Prefs(), TimeSpan.FromMinutes(10)));
    }

    [Fact]
    public void It_answers_once_the_wait_is_up()
    {
        Assert.Equal(AutoCallAction.None, Ringing(Prefs(answer: 5), 4));
        Assert.Equal(AutoCallAction.Answer, Ringing(Prefs(answer: 5), 5));
    }

    [Fact]
    public void It_rejects_once_the_wait_is_up()
    {
        Assert.Equal(AutoCallAction.Reject, Ringing(Prefs(reject: 3), 3));
    }

    /// <summary>둘 다 걸어 두면 먼저 오는 쪽이 이긴다. 같은 초면 받는 쪽이다 — 끊는 것보다 낫다.</summary>
    [Fact]
    public void The_earlier_one_wins_and_a_tie_answers()
    {
        Assert.Equal(AutoCallAction.Answer, Ringing(Prefs(answer: 3, reject: 8), 8));
        Assert.Equal(AutoCallAction.Reject, Ringing(Prefs(answer: 8, reject: 3), 8));
        Assert.Equal(AutoCallAction.Answer, Ringing(Prefs(answer: 5, reject: 5), 5));
    }

    /// <summary>이 테스트가 이 파일의 핵심이다. 깨지면 전 상담원이 묻지도 않고 전화를 받는다.</summary>
    [Fact]
    public void It_never_touches_an_offer()
    {
        Assert.Equal(AutoCallAction.None, Ringing(Prefs(answer: 1, reject: 1), 60, hasOffer: true));
    }

    /// <summary>내가 건 전화에 "자동으로 받기" 는 뜻이 없다. 그 길은 따로 있다.</summary>
    [Fact]
    public void It_leaves_our_own_outbound_call_alone()
    {
        Assert.Equal(AutoCallAction.None, Ringing(Prefs(answer: 1), 60, outbound: true));
    }

    [Fact]
    public void It_returns_to_available_after_the_wrap_up()
    {
        var prefs = Prefs(available: 20);

        Assert.False(AutoCallActions.ShouldReturnToAvailable(prefs, TimeSpan.FromSeconds(19)));
        Assert.True(AutoCallActions.ShouldReturnToAvailable(prefs, TimeSpan.FromSeconds(20)));
    }

    // --- 저장된 값 정리 ---

    [Fact]
    public void A_negative_wait_means_off()
    {
        Assert.Equal(0, Prefs(answer: -5).AutoAnswerSeconds);
    }

    [Fact]
    public void Too_long_a_wait_is_clamped()
    {
        Assert.Equal(CallPreferences.MaxAutoAnswerSeconds, Prefs(answer: 9999).AutoAnswerSeconds);
        Assert.Equal(CallPreferences.MaxAutoRejectSeconds, Prefs(reject: 9999).AutoRejectSeconds);
        Assert.Equal(
            CallPreferences.MaxAutoAvailableAfterCallSeconds,
            Prefs(available: 99999).AutoAvailableAfterCallSeconds);
    }
}
