using KAster.Desktop.Core.Protocol;

namespace KAster.Desktop.Tests.Protocol;

public class ProtocolInboxTests
{
    private static ProtocolRequest Request(string token) => new()
    {
        HandoffToken = token,
        ServerUrl = "http://pbx.local:3000",
    };

    /// <summary>
    /// 앱이 꺼져 있을 때 주소를 누르면 요청이 <b>창보다 먼저</b> 도착한다.
    /// 그때 흘려버리면 상담원은 앱만 뜨고 로그인은 안 된 화면을 본다.
    /// </summary>
    [Fact]
    public void A_request_that_arrives_before_the_window_waits_for_it()
    {
        var inbox = new ProtocolInbox();
        var seen = new List<string>();

        inbox.Enqueue(Request("t-1"));
        Assert.Empty(seen);

        inbox.Attach(r => seen.Add(r.HandoffToken));
        Assert.Empty(seen);

        inbox.MarkReady();
        Assert.Equal(new[] { "t-1" }, seen);
    }

    [Fact]
    public void A_request_that_arrives_after_the_window_is_ready_goes_straight_through()
    {
        var inbox = new ProtocolInbox();
        var seen = new List<string>();
        inbox.Attach(r => seen.Add(r.HandoffToken));
        inbox.MarkReady();

        inbox.Enqueue(Request("t-2"));

        Assert.Equal(new[] { "t-2" }, seen);
    }

    /// <summary>
    /// 핸드오프 토큰은 60초 1회용이다. 쌓아 뒀다가 순서대로 처리하면 앞의 것은
    /// 이미 만료됐거나 소비된 토큰이라 실패하고, 그 실패 문구가 성공한 것을 덮는다.
    /// <b>마지막 하나만 남긴다.</b>
    /// </summary>
    [Fact]
    public void Only_the_newest_waiting_request_is_delivered()
    {
        var inbox = new ProtocolInbox();
        var seen = new List<string>();

        inbox.Enqueue(Request("t-1"));
        inbox.Enqueue(Request("t-2"));
        inbox.Enqueue(Request("t-3"));

        inbox.Attach(r => seen.Add(r.HandoffToken));
        inbox.MarkReady();

        Assert.Equal(new[] { "t-3" }, seen);
    }

    [Fact]
    public void A_delivered_request_is_not_delivered_again()
    {
        var inbox = new ProtocolInbox();
        var seen = new List<string>();
        inbox.Attach(r => seen.Add(r.HandoffToken));

        inbox.Enqueue(Request("t-1"));
        inbox.MarkReady();
        inbox.MarkReady();

        Assert.Equal(new[] { "t-1" }, seen);
    }
}
