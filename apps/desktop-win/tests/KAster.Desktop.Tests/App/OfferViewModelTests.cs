using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;
using Xunit;

namespace KAster.Desktop.Tests.App;

public class OfferViewModelTests : SoftphoneViewModelTestBase
{
    /// <summary>
    /// 큐가 물어보는 호. 수락해야 전화기가 연결되고, 그 전까지 고객은 대기음을 듣고 있다.
    /// 이걸 화면에 못 띄우면 상담원은 누를 것이 없고 10초 뒤 다음 사람에게 넘어간다.
    /// </summary>
    [Fact]
    public void An_offered_call_takes_over_the_window()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001",
            Caller = "01034623453", TimeoutSeconds = 10,
        }));

        Assert.True(vm.Offer.HasOffer);
        Assert.Equal(WindowMode.Ringing, vm.WindowMode);
        Assert.Equal("010-3462-3453", vm.Offer.OfferPhoneNumber);
    }

    /// <summary>제안은 테넌트 전체로 뿌려진다. 남의 것을 띄우면 옆자리 호를 가로챈다.</summary>
    [Fact]
    public void An_offer_for_someone_else_is_ignored()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:2001", Linkedid = "lk", Extension = "2001", TimeoutSeconds = 10,
        }));

        Assert.False(vm.Offer.HasOffer);
    }

    /// <summary>
    /// 다른 상담원이 받았거나 시간이 지나면 내려야 한다. 안 내리면 이미 끝난 통화의
    /// 수락 버튼이 남아 상담원이 그걸 누른다.
    /// </summary>
    [Fact]
    public void A_closed_offer_leaves_the_window()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001", TimeoutSeconds = 10,
        }));

        store.Apply(new CallOfferClosedEvent("lk:1001", "1001", "TIMEOUT"));

        Assert.False(vm.Offer.HasOffer);
        Assert.Equal(WindowMode.Idle, vm.WindowMode);
    }

    [Fact]
    public async Task Accepting_an_offer_tells_the_server_which_call_it_was()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001", TimeoutSeconds = 10,
        }));

        await vm.Offer.RespondToOfferAsync(accept: true);

        var last = stub.Requests[^1];
        Assert.Equal("/api/v1/client/call-commands/offer/decision", last.RequestUri!.AbsolutePath);
        Assert.Contains("\"decision\":\"ACCEPT\"", stub.Bodies[^1]);
        Assert.Contains("\"linkedid\":\"lk\"", stub.Bodies[^1]);
    }

    [Fact]
    public async Task Rejecting_an_offer_says_so_and_clears_the_window()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001", TimeoutSeconds = 10,
        }));

        await vm.Offer.RespondToOfferAsync(accept: false);

        Assert.Contains("\"decision\":\"REJECT\"", stub.Bodies[^1]);
        Assert.False(vm.Offer.HasOffer);
    }
}
