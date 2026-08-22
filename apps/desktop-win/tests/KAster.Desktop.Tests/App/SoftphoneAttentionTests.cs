using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.State;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 창이 가려져 있으면 전화가 와도 모른다. 상담원이 다른 프로그램을 보고 있으면 그대로 놓치고,
/// 큐가 물어보는 10초가 지나면 호는 다음 사람에게 간다.
///
/// 알림을 <b>어떻게</b> 낼지는 트레이 결합부가 정한다. 화면은 알릴 것이 생겼다는 사실과
/// 거기 적을 말만 올린다.
/// </summary>
public sealed class SoftphoneAttentionTests : SoftphoneViewModelTestBase
{
    private static CallOfferedEvent Offered(string caller = "01034623453", int timeoutSeconds = 10)
        => new(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001",
            Caller = caller, TimeoutSeconds = timeoutSeconds,
        });

    [Fact]
    public void An_offer_asks_for_the_agents_attention()
    {
        var (vm, store, _, _) = Build();
        var alerts = new List<Alert>();
        vm.AttentionRequested += (_, alert) => alerts.Add(alert);

        store.Apply(Offered());

        var alert = Assert.Single(alerts);
        Assert.Contains("010-3462-3453", alert.Body);
        Assert.Contains("10초 남음", alert.Body);
    }

    /// <summary>
    /// 제안이 내려가는 것은 알릴 일이 아니다. 다른 상담원이 받았거나 시간이 지난 것뿐이고,
    /// 그때 풍선을 하나 더 띄우면 방금 놓친 것을 두 번 알리는 꼴이 된다.
    /// </summary>
    [Fact]
    public void A_closing_offer_does_not_ask_for_anything()
    {
        var (vm, store, _, _) = Build();
        store.Apply(Offered());

        var alerts = new List<Alert>();
        vm.AttentionRequested += (_, alert) => alerts.Add(alert);
        store.Apply(new CallOfferClosedEvent("lk:1001", "1001", "TIMEOUT"));

        Assert.Empty(alerts);
    }

    /// <summary>서버가 대기 시간을 안 내려주는 현장이 있다. 그때 "0초" 를 적으면 이미 늦은 줄 안다.</summary>
    [Fact]
    public void An_offer_without_a_countdown_still_says_who_is_calling()
    {
        var (vm, store, _, _) = Build();
        var alerts = new List<Alert>();
        vm.AttentionRequested += (_, alert) => alerts.Add(alert);

        store.Apply(Offered(timeoutSeconds: 0));

        var alert = Assert.Single(alerts);
        Assert.Contains("010-3462-3453", alert.Body);
        Assert.DoesNotContain("초", alert.Body);
    }

    /// <summary>
    /// 트레이·핫키처럼 화면 밖에서 올라온 것도 상담원이 보는 곳은 같아야 한다.
    /// 조립 지점이 자기만 아는 자리에 적으면 상담원은 그것을 영영 못 본다.
    /// </summary>
    [Fact]
    public void A_notice_from_outside_the_screen_lands_where_the_agent_looks()
    {
        var (vm, _, _, _) = Build();

        vm.ShowNotice("받기 핫키를 등록하지 못했다");

        Assert.Equal("받기 핫키를 등록하지 못했다", vm.NoticeMessage);
    }
}
