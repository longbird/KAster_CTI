using KAster.Desktop.App.ViewModels;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 웹에서 넘어온 로그인 요청을 받을지 정한다. <b>순수 함수다</b> — 창도 서버도 건드리지 않는다.
/// </summary>
public class HandoffGateTests
{
    private static HandoffDecision Decide(
        bool signedIn = false,
        bool onCall = false,
        bool sameServer = true,
        string agentName = "김상담",
        string extension = "1001")
        => HandoffGate.For(signedIn, onCall, sameServer, agentName, extension);

    /// <summary>로그인 전이면 막을 것이 없다. 이것이 이 기능의 본래 쓰임이다.</summary>
    [Fact]
    public void A_signed_out_app_takes_the_session_straight_away()
    {
        Assert.Equal(HandoffVerdict.Accept, Decide().Verdict);
    }

    /// <summary>
    /// <b>통화 중에는 받지 않는다.</b> 세션을 넘기려면 지금 세션을 내려야 하는데, 그러면 SIP 등록이
    /// 풀리고 고객 통화가 그 자리에서 끊긴다. 미뤄 뒀다 처리하지도 않는다 —
    /// 핸드오프 토큰은 60초짜리라 통화가 끝날 때쯤에는 이미 만료돼 있고,
    /// 그때 가서 실패를 보여 주는 것보다 지금 말해 주는 편이 낫다.
    /// </summary>
    [Fact]
    public void A_call_in_progress_refuses_the_handoff()
    {
        var decision = Decide(signedIn: true, onCall: true);

        Assert.Equal(HandoffVerdict.Refuse, decision.Verdict);
        Assert.Contains("통화", decision.Message);
    }

    /// <summary>통화 중이면 로그인 여부와 무관하게 거절한다.</summary>
    [Fact]
    public void A_call_in_progress_refuses_even_when_the_request_looks_harmless()
    {
        Assert.Equal(HandoffVerdict.Refuse, Decide(signedIn: false, onCall: true).Verdict);
    }

    /// <summary>
    /// 이미 로그인해 있으면 <b>묻는다</b>. 조용히 갈아타면 상담원은 자기 화면이 남의 계정이 된 것을
    /// 모른 채 그 계정으로 전화를 받고, 그 통화가 남의 실적과 기록에 남는다.
    /// 지금 누구로 앉아 있는지를 물음에 적어 그 사람이 판단하게 한다.
    /// </summary>
    [Fact]
    public void An_already_signed_in_app_asks_before_switching()
    {
        var decision = Decide(signedIn: true);

        Assert.Equal(HandoffVerdict.AskToSwitch, decision.Verdict);
        Assert.Contains("김상담", decision.Message);
        Assert.Contains("1001", decision.Message);
    }

    /// <summary>
    /// 페이로드가 가리키는 서버가 이 PC 에 설정된 서버가 아니면 <b>무조건 거절이다</b>.
    /// 통화 중인지 로그인했는지보다 먼저 본다 — 남의 서버에 우리 토큰을 넘기는 일이기 때문이다.
    /// </summary>
    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public void A_request_for_another_server_is_always_refused(bool signedIn, bool onCall)
    {
        var decision = HandoffGate.For(signedIn, onCall, sameServer: false, "김상담", "1001");

        Assert.Equal(HandoffVerdict.Refuse, decision.Verdict);
        Assert.Contains("서버", decision.Message);
    }
}
