using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using Xunit;

namespace KAster.Desktop.Tests.Server;

/// <summary>
/// 큐가 호를 넘기기 전에 서버가 보내는 제안. 이걸 못 읽으면 상담원은 수락 버튼을
/// 보지 못하고, 10초 뒤 시간 초과로 아무도 전화를 못 받는다.
/// </summary>
public class CtiEventParserOfferTests
{
    [Fact]
    public void An_offer_carries_who_is_calling_and_how_long_there_is_to_decide()
    {
        const string json = """
        {"offerId":"1787356767.48:1001","linkedid":"1787356767.48",
         "extension":"1001","caller":"01034623453","timeoutSeconds":10}
        """;

        var parsed = Assert.IsType<CallOfferedEvent>(
            CtiEventParser.Parse(CtiEventNames.CallOffered, json));

        Assert.Equal("1787356767.48:1001", parsed.Offer.OfferId);
        Assert.Equal("1787356767.48", parsed.Offer.Linkedid);
        Assert.Equal("1001", parsed.Offer.Extension);
        Assert.Equal("01034623453", parsed.Offer.Caller);
        Assert.Equal(10, parsed.Offer.TimeoutSeconds);
    }

    /// <summary>발신번호 표시제한이면 번호가 없다. 그 때문에 제안을 통째로 버리면 안 된다.</summary>
    [Fact]
    public void An_offer_without_a_number_is_still_an_offer()
    {
        const string json = """
        {"offerId":"a:1001","linkedid":"a","extension":"1001","caller":null,"timeoutSeconds":10}
        """;

        var parsed = Assert.IsType<CallOfferedEvent>(
            CtiEventParser.Parse(CtiEventNames.CallOffered, json));

        Assert.Null(parsed.Offer.Caller);
    }

    /// <summary>
    /// 다른 상담원이 받았거나 시간이 지나면 화면에서 내려야 한다.
    /// 안 내리면 이미 끝난 통화의 수락 버튼이 남아 상담원이 누르게 된다.
    /// </summary>
    [Fact]
    public void A_closed_offer_says_which_one_to_take_down()
    {
        const string json = """
        {"offerId":"a:1001","extension":"1001","decision":"TIMEOUT"}
        """;

        var parsed = Assert.IsType<CallOfferClosedEvent>(
            CtiEventParser.Parse(CtiEventNames.CallOfferClosed, json));

        Assert.Equal("a:1001", parsed.OfferId);
        Assert.Equal("TIMEOUT", parsed.Decision);
    }

    [Fact]
    public void Both_offer_events_are_subscribed_to()
    {
        Assert.Contains(CtiEventNames.CallOffered, CtiEventNames.All);
        Assert.Contains(CtiEventNames.CallOfferClosed, CtiEventNames.All);
    }
}
