using KAster.Desktop.Core.Contracts;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 통화를 돌려줄 상대 한 명.
///
/// 상태를 모르고 돌려주면 통화가 허공으로 간다 — 자리비움이거나 로그아웃한 사람에게
/// 넘기면 아무도 받지 않고, 발신자는 그 사이 기다리다 끊는다.
/// </summary>
public sealed record TransferTarget(
    string Extension,
    string AgentName,
    string StatusText,
    bool CanTakeCall)
{
    public static TransferTarget From(AgentDirectoryEntry entry, bool onACall)
    {
        var loggedOut = !string.Equals(entry.LoginStatus, "LOGGED_IN", StringComparison.OrdinalIgnoreCase);
        var status = entry.CurrentStatus?.StatusCode ?? AgentStatusCode.Unknown;

        // 전화기가 등록돼 있어야 벨이 울린다. 앱에 로그인해 있어도 단말이 없으면 못 받는다.
        var phoneReady = entry.SipRegistration?.Registered ?? false;

        return new TransferTarget(
            entry.Extension.Trim(),
            entry.AgentName,
            DescribeStatus(loggedOut, onACall, status, phoneReady),
            !loggedOut && !onACall && phoneReady && TakesCalls(status));
    }

    private static string DescribeStatus(bool loggedOut, bool onACall, AgentStatusCode status, bool phoneReady)
    {
        // 읽는 사람이 알아야 하는 것은 "지금 받을 수 있나" 다. 가장 막는 이유부터 보여 준다.
        if (loggedOut) return "로그아웃";
        if (onACall) return "통화 중";
        if (!phoneReady) return "전화기 꺼짐";

        return status switch
        {
            AgentStatusCode.Available => "대기",
            AgentStatusCode.Ringing => "벨 울림",
            AgentStatusCode.Talking => "통화 중",
            AgentStatusCode.AfterCallWork => "후처리",
            AgentStatusCode.Break => "자리비움",
            AgentStatusCode.Meal => "식사",
            AgentStatusCode.Training => "교육",
            AgentStatusCode.ManualPaused => "일시정지",
            _ => "알 수 없음",
        };
    }

    private static bool TakesCalls(AgentStatusCode status)
        => status is AgentStatusCode.Available;
}
