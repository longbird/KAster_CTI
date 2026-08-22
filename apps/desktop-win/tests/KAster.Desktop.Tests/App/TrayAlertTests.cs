using KAster.Desktop.App.Services;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 제안 알림. 큐가 물어보는 시간은 10초 남짓이고, 그 안에 알아채지 못하면 전화는 다음 사람에게 간다.
///
/// <b>알림은 알리는 것이지 뺏는 것이 아니다.</b> 상담원이 아무것도 안 눌렀는데 창을 앞으로 끌어내
/// 하던 작업을 가리는 동작은 넣지 않는다 — 그래서 이 판정이 내놓는 수단에 "창을 앞으로" 가 없다.
/// </summary>
public sealed class TrayAlertTests
{
    /// <summary>이미 화면을 보고 있는 사람에게 풍선을 띄우면 소음이다. 화면에 이미 제안이 떠 있다.</summary>
    [Fact]
    public void A_screen_the_agent_is_already_looking_at_gets_no_popup()
    {
        Assert.Equal(
            AlertChannel.None,
            AlertDelivery.For(windowIsForeground: true, windowIsMinimized: false));
    }

    /// <summary>다른 프로그램을 보고 있으면 이것 하나가 유일한 창구다.</summary>
    [Fact]
    public void A_covered_window_gets_both_a_balloon_and_a_taskbar_flash()
    {
        var channels = AlertDelivery.For(windowIsForeground: false, windowIsMinimized: false);

        Assert.True(channels.HasFlag(AlertChannel.Balloon));
        Assert.True(channels.HasFlag(AlertChannel.Flash));
    }

    /// <summary>
    /// <b>최소화된 창은 무슨 일이 있어도 알림을 받는다.</b> 상담원이 창을 내려 둔 상태가 알림이
    /// 가장 필요한 상황인데, 여기가 "이미 보고 있다" 로 새면 그 자리는 10초를 통째로 놓친다.
    ///
    /// 최소화된 창이 활성으로 보고되는 일은 없어야 하지만, 그 하나에만 기대지 않는다 —
    /// 못 보는 창에 알림을 삼키는 실패는 화면에 아무 흔적도 남기지 않는다.
    /// </summary>
    [Fact]
    public void A_minimized_window_is_alerted_even_if_it_reports_itself_as_active()
    {
        var channels = AlertDelivery.For(windowIsForeground: true, windowIsMinimized: true);

        Assert.True(channels.HasFlag(AlertChannel.Balloon));
        Assert.True(channels.HasFlag(AlertChannel.Flash));
    }

    /// <summary>번호는 받을지 말지를 정하는 데 쓰인다. 문구에서 빠지면 풍선을 봐도 눌러야 알 수 있다.</summary>
    [Fact]
    public void The_balloon_carries_the_number_and_the_time_left()
    {
        var alert = OfferAlert.For("010-1111-2222", "8초 남음");

        Assert.Contains("010-1111-2222", alert.Body);
        Assert.Contains("8초 남음", alert.Body);
    }

    /// <summary>발신번호 표시제한이면 번호 자체가 없다. 그때 빈 줄을 띄우면 뭘 보라는 건지 알 수 없다.</summary>
    [Fact]
    public void A_withheld_number_still_says_something()
    {
        var alert = OfferAlert.For("번호 없음", string.Empty);

        Assert.Contains("번호 없음", alert.Body);
        Assert.False(string.IsNullOrWhiteSpace(alert.Title));
    }
}
