namespace KAster.Desktop.App.Services;

/// <summary>알릴 것 하나. 트레이가 이것을 풍선으로 띄운다.</summary>
public sealed record Alert(string Title, string Body);

/// <summary>
/// 알릴 수단. <b>"창을 앞으로" 가 없는 것이 이 목록의 요지다</b> — 상담원이 아무것도 안 눌렀는데
/// 창이 튀어나와 하던 작업을 가리면, 그건 알리는 것이 아니라 뺏는 것이다.
/// </summary>
[Flags]
public enum AlertChannel
{
    None = 0,

    /// <summary>트레이 풍선. 무엇이 왔는지 글로 말한다.</summary>
    Balloon = 1,

    /// <summary>작업 표시줄 깜빡임. 초점을 뺏지 않고 눈에만 걸린다.</summary>
    Flash = 2,
}

/// <summary>알림을 어디로 낼지 정한다. 순수 함수다.</summary>
public static class AlertDelivery
{
    /// <summary>
    /// 이미 보고 있는 화면에는 아무것도 안 낸다 — 그 창에 제안이 이미 떠 있고,
    /// 그 위에 풍선을 하나 더 얹으면 소음만 는다.
    ///
    /// <b>최소화는 따로 묻는다.</b> 내려 둔 창은 활성으로 보고될 수 없다지만, 그 하나에 기대면
    /// 알림을 삼키는 실패가 화면에 아무 흔적도 남기지 않는다 — 상담원은 전화가 안 왔다고 믿는다.
    /// 알림이 가장 필요한 상황이 바로 이때다.
    /// </summary>
    /// <param name="windowIsMinimized">창이 작업 표시줄로 내려가 있는가.</param>
    public static AlertChannel For(bool windowIsForeground, bool windowIsMinimized)
        => windowIsForeground && !windowIsMinimized
            ? AlertChannel.None
            : AlertChannel.Balloon | AlertChannel.Flash;
}

/// <summary>큐가 물어보는 호를 트레이 풍선 한 장으로 적는다.</summary>
public static class OfferAlert
{
    /// <param name="phoneNumber">고객 번호. 표시제한이면 "번호 없음" 이 그대로 들어온다.</param>
    /// <param name="countdownText">남은 시간. 서버가 대기 시간을 안 내려주면 비어 있다.</param>
    public static Alert For(string phoneNumber, string countdownText)
    {
        // 번호는 받을지 말지를 정하는 근거다. 남은 시간은 있을 때만 붙인다 —
        // 없는 값을 "0초" 로 채우면 이미 늦은 줄 알고 안 누른다.
        var body = string.IsNullOrWhiteSpace(countdownText)
            ? phoneNumber
            : $"{phoneNumber} · {countdownText}";

        return new Alert("걸려 온 전화", body);
    }
}
