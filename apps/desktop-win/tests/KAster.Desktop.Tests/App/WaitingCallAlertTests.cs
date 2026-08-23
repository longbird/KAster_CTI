using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 큐에 전화가 새로 들어왔는데 아무도 안 받으면 대기 목록에만 남는다. 상담원이 다른 창을
/// 보고 있으면 그 목록을 안 본다 — 고객은 계속 기다린다.
///
/// 자리를 비운 사람에게는 알리지 않는다. 받을 수 없는 자리에 울리는 알림은 소음이고,
/// 소음이 쌓이면 진짜 알림도 무시하게 된다.
/// </summary>
public class WaitingCallAlertTests
{
    private static WaitingCall Call(string id) => new(id, "010-3462-3453", null, "기본", "대표번호");

    private static Alert? Alert(
        AgentStatusCode status,
        bool offerOnScreen = false,
        params string[] ids)
        => WaitingCallAlert.For(ids.Select(Call).ToArray(), status, offerOnScreen);

    [Fact]
    public void A_new_call_alerts_an_agent_on_duty()
    {
        foreach (var status in new[]
        {
            AgentStatusCode.Available,
            AgentStatusCode.Ringing,
            AgentStatusCode.Talking,
            AgentStatusCode.AfterCallWork,
        })
        {
            Assert.NotNull(Alert(status, ids: "c-1"));
        }
    }

    /// <summary>이 테스트가 이 파일의 요지다. 자리를 비운 사람에게 울리면 소음이다.</summary>
    [Fact]
    public void An_agent_who_stepped_away_is_left_alone()
    {
        foreach (var status in new[]
        {
            AgentStatusCode.Break,
            AgentStatusCode.Meal,
            AgentStatusCode.Training,
            AgentStatusCode.ManualPaused,
        })
        {
            Assert.Null(Alert(status, ids: "c-1"));
        }
    }

    /// <summary>수락/거절 화면이 이미 떠 있다. 그 위에 풍선을 얹으면 소음만 는다.</summary>
    [Fact]
    public void An_offer_already_on_screen_is_loud_enough()
    {
        Assert.Null(Alert(AgentStatusCode.Available, offerOnScreen: true, ids: "c-1"));
    }

    [Fact]
    public void Nothing_new_means_nothing_to_say()
    {
        Assert.Null(Alert(AgentStatusCode.Available));
    }

    [Fact]
    public void One_call_shows_its_number()
    {
        var alert = Alert(AgentStatusCode.Available, ids: "c-1")!;

        Assert.Contains("010-3462-3453", alert.Body, StringComparison.Ordinal);
    }

    /// <summary>여러 건이면 번호를 다 늘어놓지 않는다. 풍선은 짧아야 읽힌다.</summary>
    [Fact]
    public void Several_calls_show_how_many()
    {
        var alert = Alert(AgentStatusCode.Available, ids: new[] { "c-1", "c-2", "c-3" })!;

        Assert.Contains("3", alert.Body, StringComparison.Ordinal);
    }

    /// <summary>서버가 모르는 상태를 보내와도 알린다. 놓친 전화보다 소음 한 번이 낫다.</summary>
    [Fact]
    public void An_unknown_status_still_alerts()
    {
        Assert.NotNull(Alert(AgentStatusCode.Unknown, ids: "c-1"));
    }
}
