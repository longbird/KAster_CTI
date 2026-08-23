namespace KAster.Desktop.App.Services;

public enum AutoCallAction
{
    None,
    Answer,
    Reject,
}

/// <summary>
/// 걸려 온 전화를 스스로 받거나 끊을 때가 됐는지. <b>순수 판정이다</b> — 서버도 전화기도 건드리지 않는다.
/// </summary>
public static class AutoCallActions
{
    /// <summary>
    /// 울리는 동안 할 일.
    ///
    /// <para>
    /// <b>제안이 떠 있으면 아무것도 하지 않는다.</b> 그건 "이 호를 받으시겠습니까" 를 사람에게
    /// 묻는 자리다. 거기에 자동 수락을 붙이면 자리를 비운 상담원에게도 전화가 꽂히고,
    /// 고객은 아무도 없는 자리에서 무음을 듣는다. 수락/거절 기능을 만든 이유가 통째로 사라진다.
    /// </para>
    ///
    /// <para>내가 건 전화도 건드리지 않는다. 그 자동 응답은 <see cref="CallPreferences.SelfAnswerWindowSeconds"/> 가 따로 본다.</para>
    /// </summary>
    public static AutoCallAction WhileRinging(
        CallPreferences preferences,
        bool hasOffer,
        bool isOutboundCall,
        TimeSpan ringingFor)
    {
        if (hasOffer || isOutboundCall) return AutoCallAction.None;

        var seconds = ringingFor.TotalSeconds;
        var answerDue = preferences.AutoAnswerSeconds > 0 && seconds >= preferences.AutoAnswerSeconds;
        var rejectDue = preferences.AutoRejectSeconds > 0 && seconds >= preferences.AutoRejectSeconds;

        if (answerDue && rejectDue)
        {
            // 먼저 오는 쪽이 이긴다. 같은 초면 받는 쪽이다 — 끊는 것보다 낫다.
            return preferences.AutoRejectSeconds < preferences.AutoAnswerSeconds
                ? AutoCallAction.Reject
                : AutoCallAction.Answer;
        }

        if (answerDue) return AutoCallAction.Answer;
        if (rejectDue) return AutoCallAction.Reject;

        return AutoCallAction.None;
    }

    /// <summary>후처리를 끝내고 스스로 대기로 돌아갈 때가 됐는가.</summary>
    public static bool ShouldReturnToAvailable(CallPreferences preferences, TimeSpan afterCallFor)
        => preferences.AutoAvailableAfterCallSeconds > 0
            && afterCallFor.TotalSeconds >= preferences.AutoAvailableAfterCallSeconds;
}
