using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 큐에 전화가 새로 들어왔을 때 알릴지 정한다. <b>순수 판정이다</b> — 트레이도 서버도 건드리지 않는다.
/// </summary>
public static class WaitingCallAlert
{
    /// <summary>
    /// 자리를 비운 상태. 서버의 <c>pausesQueueAssignment</c> 와 같은 목록이어야 한다 —
    /// 두 곳이 갈리면 큐에서 빠진 자리에 알림만 울린다.
    /// </summary>
    private static readonly HashSet<AgentStatusCode> SteppedAway = new()
    {
        AgentStatusCode.Break,
        AgentStatusCode.Meal,
        AgentStatusCode.Training,
        AgentStatusCode.ManualPaused,
    };

    /// <summary>
    /// 업무 중인가. 서버가 모르는 상태를 보내와도 업무 중으로 본다 —
    /// <b>놓친 전화보다 소음 한 번이 낫다.</b>
    /// </summary>
    public static bool IsOnDuty(AgentStatusCode status) => !SteppedAway.Contains(status);

    /// <summary>
    /// 새로 들어온 대기 통화를 알릴 문구. 알릴 것이 없으면 null 이다.
    ///
    /// <para>
    /// 수락/거절 화면이 이미 떠 있으면 알리지 않는다. 그 위에 풍선을 얹으면 소음만 는다.
    /// </para>
    /// </summary>
    public static Alert? For(
        IReadOnlyList<WaitingCall> newlyWaiting,
        AgentStatusCode status,
        bool offerOnScreen)
    {
        if (newlyWaiting.Count == 0) return null;
        if (offerOnScreen) return null;
        if (!IsOnDuty(status)) return null;

        // 풍선은 짧아야 읽힌다. 여러 건이면 번호를 늘어놓지 않고 건수를 말한다.
        var body = newlyWaiting.Count == 1
            ? $"{newlyWaiting[0].PhoneNumber} 님이 기다리고 있습니다."
            : $"{newlyWaiting.Count}건이 기다리고 있습니다.";

        return new Alert("대기 중인 전화", body);
    }
}
