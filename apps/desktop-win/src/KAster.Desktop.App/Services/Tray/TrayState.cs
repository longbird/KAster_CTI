using KAster.Desktop.Core.Contracts;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 트레이 아이콘이 지금 말하는 것. 창이 가려져 있을 때 상담원에게 남는 유일한 표시라
/// <b>전화를 받을 수 있는 자리인지</b>가 한눈에 갈려야 한다.
/// </summary>
public enum TrayStatus
{
    /// <summary>서버와 끊겼다. 새 전화도 상태 변경도 오지 않는다.</summary>
    Disconnected,

    /// <summary>전화기가 PBX 에 등록돼 있지 않다. 서버는 붙어 있어도 전화는 한 통도 안 온다.</summary>
    PhoneDown,

    Break,
    Available,
    Ringing,
    Talking,
}

/// <summary>
/// 아이콘 하나와 그 위에 뜨는 한 줄.
/// </summary>
/// <param name="Attention">
/// 이번 프레임을 강조색으로 칠하는가. 깜빡임의 켜진 쪽이다 — 상태가 아니라 <b>그리는 방식</b>이라
/// <see cref="TrayStatus"/> 를 늘리지 않고 여기 둔다.
/// </param>
public sealed record TrayState(TrayStatus Status, string Tooltip, bool Attention = false);

/// <summary>
/// 수신 중인 아이콘을 깜빡이게 한다. <b>순수 함수다</b> — 트레이 결합부는 이 결과를 그리기만 한다.
///
/// 왜 깜빡임이 필요한가: 트레이 풍선은 윈도우의 알림 설정과 집중 지원이 <b>조용히 삼킬 수 있다</b>.
/// 실제로 이 코드베이스에서 풍선이 화면에 뜨는 것을 확인하지 못한 실행이 있었다.
/// 풍선 하나에 기대면 알림이 통째로 사라지는 자리가 생기는데, 아이콘은 우리가 직접 그리는 것이라
/// 어떤 설정으로도 꺼지지 않는다.
/// </summary>
public static class TrayBlink
{
    /// <param name="tick">1초 타이머의 순번. 홀수 틱에 강조색으로 넘어간다.</param>
    public static TrayState For(TrayState state, long tick)
        => state.Status == TrayStatus.Ringing && tick % 2 != 0
            ? state with { Attention = true }
            : state with { Attention = false };
}

/// <summary>
/// 상태 몇 개를 트레이 표시 하나로 접는다. <b>순수 함수다</b> — 트레이 결합부는 이 결과를
/// 그리기만 하고 판정하지 않는다.
/// </summary>
public static class TrayPresentation
{
    public static TrayState For(
        bool isConnected,
        bool isPhoneRegistered,
        WindowMode mode,
        AgentStatusCode status,
        string agentName,
        string extension)
    {
        var trayStatus = Resolve(isConnected, isPhoneRegistered, mode, status);
        return new TrayState(trayStatus, $"PBX 상담원 · {agentName}({extension}) · {Label(trayStatus)}");
    }

    /// <summary>
    /// 지금 벌어지는 통화가 가장 앞이다. 통화 소리는 SIP 로 흐르므로 웹소켓이 끊겨도 이어지는데,
    /// 그때 아이콘을 "서버 끊김" 으로 바꾸면 통화 중인 자리가 비어 보인다.
    ///
    /// 통화가 없을 때는 <b>전화를 못 받게 만드는 것</b>부터 말한다 — 서버 끊김, 그다음 전화기 등록.
    /// 이석은 상담원이 스스로 고른 것이라 마지막이다.
    /// </summary>
    private static TrayStatus Resolve(
        bool isConnected,
        bool isPhoneRegistered,
        WindowMode mode,
        AgentStatusCode status)
    {
        if (mode == WindowMode.Ringing) return TrayStatus.Ringing;
        if (mode is WindowMode.Talking or WindowMode.Transferring or WindowMode.AfterCall) return TrayStatus.Talking;

        if (!isConnected) return TrayStatus.Disconnected;
        if (!isPhoneRegistered) return TrayStatus.PhoneDown;

        // 이석의 기준은 통화 화면의 <c>IsAvailable</c> 과 같아야 한다. 두 곳이 다르게 판단하면
        // 화면은 "대기 중" 인데 트레이만 "이석" 인 자리가 생긴다.
        return status == AgentStatusCode.Break ? TrayStatus.Break : TrayStatus.Available;
    }

    /// <summary>
    /// 아이콘을 칠할 색. <b>값이 아니라 토큰 이름을 돌려준다</b> — 색상 리터럴은 <c>Tokens.xaml</c>
    /// 에만 있고, 트레이도 화면과 같은 표를 본다.
    ///
    /// 전화가 한 통도 안 오는 두 상태(서버 끊김·전화기 미등록)는 같은 위험색이다. 상담원이 할 일이
    /// 같고("고쳐야 전화가 온다"), 무엇이 문제인지는 툴팁이 말한다.
    /// </summary>
    /// <param name="attention">
    /// 깜빡임의 켜진 프레임인가. 켜진 쪽은 <b>다른 색이어야 한다</b> — 같은 색이면 깜빡이지 않는 것과 같다.
    /// </param>
    public static string BrushKeyFor(TrayStatus status, bool attention = false) => status switch
    {
        TrayStatus.Disconnected or TrayStatus.PhoneDown => "BrushDanger",
        TrayStatus.Break => "BrushTextMuted",
        TrayStatus.Ringing => attention ? "BrushDanger" : "BrushWarning",
        TrayStatus.Talking => "BrushAccent",
        _ => "BrushSuccess",
    };

    private static string Label(TrayStatus status) => status switch
    {
        TrayStatus.Disconnected => "서버 끊김",
        TrayStatus.PhoneDown => "전화기 등록 안 됨",
        TrayStatus.Break => "이석",
        TrayStatus.Ringing => "수신 중",
        TrayStatus.Talking => "통화 중",
        _ => "대기 중",
    };
}
