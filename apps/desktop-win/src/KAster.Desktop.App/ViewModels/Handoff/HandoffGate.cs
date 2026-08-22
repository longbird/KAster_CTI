namespace KAster.Desktop.App.ViewModels;

public enum HandoffVerdict
{
    /// <summary>그대로 받는다.</summary>
    Accept,

    /// <summary>상담원에게 물어본 뒤에 받는다.</summary>
    AskToSwitch,

    /// <summary>받지 않는다. <see cref="HandoffDecision.Message"/> 를 그대로 보여 준다.</summary>
    Refuse,
}

public sealed record HandoffDecision(HandoffVerdict Verdict, string Message);

/// <summary>
/// 웹에서 넘어온 로그인 요청을 받을지 정한다. <b>순수 함수다</b> — 창도 서버도 건드리지 않는다.
///
/// 판정을 여기 모아 두는 이유는, 이 세 갈래가 각각 <b>다른 사고를 막고 있어서</b>다:
/// 남의 서버로 토큰이 새는 것 · 고객 통화가 끊기는 것 · 상담원 모르게 계정이 바뀌는 것.
/// 조립 지점에 흩어 두면 그중 하나가 조용히 빠진다.
/// </summary>
public static class HandoffGate
{
    public static HandoffDecision For(
        bool signedIn,
        bool onCall,
        bool sameServer,
        string? currentAgentName,
        string? currentExtension)
    {
        // 먼저 본다. 남의 서버에 우리 토큰을 넘기는 일이라 다른 사정보다 앞선다.
        if (!sameServer)
        {
            return new HandoffDecision(
                HandoffVerdict.Refuse,
                "이 PC 에 설정된 서버가 아닌 곳에서 온 로그인 요청이라 받지 않았습니다.");
        }

        // 세션을 넘기려면 지금 세션을 내려야 하는데, 그러면 SIP 등록이 풀려 고객 통화가 그 자리에서
        // 끊긴다. 미뤄 뒀다 처리하지도 않는다 — 토큰이 60초짜리라 통화가 끝날 때쯤엔 이미 만료다.
        if (onCall)
        {
            return new HandoffDecision(
                HandoffVerdict.Refuse,
                "통화 중에는 웹에서 넘어온 로그인을 받지 않습니다. 통화를 마친 뒤 다시 눌러 주세요.");
        }

        if (!signedIn)
        {
            return new HandoffDecision(HandoffVerdict.Accept, string.Empty);
        }

        // 조용히 갈아타면 상담원은 자기 화면이 남의 계정이 된 것을 모른 채 그 계정으로 전화를 받고,
        // 그 통화가 남의 실적과 기록에 남는다. 지금 누구로 앉아 있는지를 적어 그 사람이 정하게 한다.
        var who = Describe(currentAgentName, currentExtension);
        return new HandoffDecision(
            HandoffVerdict.AskToSwitch,
            $"웹에서 로그인 요청이 왔습니다.{Environment.NewLine}"
            + $"지금 {who} 계정으로 로그인되어 있습니다. 로그아웃하고 넘어갈까요?");
    }

    private static string Describe(string? name, string? extension)
    {
        var who = string.IsNullOrWhiteSpace(name) ? string.Empty : name!.Trim();
        var line = string.IsNullOrWhiteSpace(extension) ? string.Empty : $"내선 {extension!.Trim()}";

        if (who.Length == 0) return line.Length == 0 ? "다른" : line;
        return line.Length == 0 ? who : $"{who}({line})";
    }
}
