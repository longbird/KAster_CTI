using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;
using KAster.Desktop.Tests.Server;
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

    // --- 남은 시간 ---
    //
    // 서버가 제안마다 대기 시간을 내려주는데(관리자가 1~60초로 조절한다) 상담원은 몇 초가
    // 남았는지 알 수 없었다. 시계를 주입해 테스트가 시간을 민다.

    private (OfferViewModel Offer, CallStateStore Store) BuildOffer()
    {
        var store = new CallStateStore(Agent.AgentId, () => _now, null, Agent.Extension);
        var server = new CtiServerClient(
            new HttpClient(new StubHttpHandler()) { BaseAddress = new Uri("http://server/api/v1/") });

        return (new OfferViewModel(store, server, _ => { }, _ => { }, () => _now), store);
    }

    private static void Offered(CallStateStore store, int timeoutSeconds) =>
        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001",
            Caller = "01034623453", TimeoutSeconds = timeoutSeconds,
        }));

    [Fact]
    public void A_new_offer_shows_how_long_is_left()
    {
        var (offer, store) = BuildOffer();

        Offered(store, 10);

        Assert.True(offer.HasCountdown);
        Assert.Equal(10, offer.SecondsRemaining);
        Assert.Equal("10초 남음", offer.CountdownText);
    }

    [Fact]
    public void The_countdown_falls_as_time_passes()
    {
        var (offer, store) = BuildOffer();
        Offered(store, 10);

        _now = _now.AddSeconds(4);
        offer.Tick();

        Assert.Equal(6, offer.SecondsRemaining);
        Assert.Equal("6초 남음", offer.CountdownText);
    }

    /// <summary>
    /// 같은 초에 두 번 불려도 화면이 두 번 흔들리면 안 된다. 통화 화면의 1초 타이머와
    /// 창 쪽 타이머가 둘 다 밀 수 있으므로 몇 번 불리든 결과가 같아야 한다.
    /// </summary>
    [Fact]
    public void Ticking_twice_in_the_same_second_changes_nothing()
    {
        var (offer, store) = BuildOffer();
        Offered(store, 10);

        _now = _now.AddSeconds(3);
        var raised = 0;
        offer.PropertyChanged += (_, e) => { if (e.PropertyName == nameof(offer.SecondsRemaining)) raised++; };

        offer.Tick();
        offer.Tick();
        offer.Tick();

        Assert.Equal(1, raised);
        Assert.Equal(7, offer.SecondsRemaining);
    }

    /// <summary>
    /// 0 이 돼도 제안을 화면에서 지우지 않는다. 제안을 닫는 진실원은 서버의
    /// <c>agent.offer.closed</c> 다 — 카운트다운은 표시일 뿐이라, 여기서 지우면
    /// 서버가 아직 안 닫은 제안을 화면만 지워 받을 수 있는 전화를 놓친다.
    /// </summary>
    [Fact]
    public void The_countdown_stops_at_zero_and_leaves_the_offer_on_screen()
    {
        var (offer, store) = BuildOffer();
        Offered(store, 10);

        _now = _now.AddSeconds(30);
        offer.Tick();

        Assert.Equal(0, offer.SecondsRemaining);
        Assert.Equal("대기 시간 초과", offer.CountdownText);
        Assert.True(offer.HasOffer);
        Assert.True(offer.AcceptOfferCommand.CanExecute(null));
    }

    [Fact]
    public void A_closed_offer_clears_the_countdown()
    {
        var (offer, store) = BuildOffer();
        Offered(store, 10);

        store.Apply(new CallOfferClosedEvent("lk:1001", "1001", "TIMEOUT"));

        Assert.False(offer.HasCountdown);
        Assert.Equal(string.Empty, offer.CountdownText);
    }

    /// <summary>대기 시간을 안 내려주는 서버도 있다. 그때는 "0초 남음" 대신 아무것도 안 띄운다.</summary>
    [Fact]
    public void An_offer_without_a_timeout_shows_no_countdown()
    {
        var (offer, store) = BuildOffer();

        Offered(store, 0);

        Assert.True(offer.HasOffer);
        Assert.False(offer.HasCountdown);
        Assert.Equal(string.Empty, offer.CountdownText);
    }

    /// <summary>제안이 안 떠 있을 때 타이머가 계속 도는 것은 정상이다. 거기서 터지면 앱이 멈춘다.</summary>
    [Fact]
    public void Ticking_with_no_offer_does_nothing()
    {
        var (offer, _) = BuildOffer();

        offer.Tick();

        Assert.False(offer.HasCountdown);
        Assert.Equal(0, offer.SecondsRemaining);
    }
}
