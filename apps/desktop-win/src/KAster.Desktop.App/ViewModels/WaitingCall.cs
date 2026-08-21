namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 당겨받을 수 있는 전화 한 줄.
///
/// 상담원이 받을지 말지 고를 때 보는 것은 둘이다: <b>고객이 어느 지사로 걸었는가</b>와
/// <b>고객 번호</b>. 인사말이 지사마다 달라 지사를 먼저 읽는다.
/// 고객명은 모르는 경우가 더 많으므로 있을 때만 덧붙인다.
/// </summary>
public sealed record WaitingCall(
    string CallId,
    string PhoneNumber,
    string? CustomerName,
    string? QueueName,
    string BranchLine)
{
    /// <summary>
    /// 큰 글씨. 번호가 온다 — 이름은 비어 있는 경우가 더 많다.
    /// 발신번호 표시제한이면 번호도 없으므로 그 사실을 적는다.
    /// </summary>
    public string Title => PhoneNumber.Length > 0
        ? PhoneNumber
        : CustomerName is { Length: > 0 } name ? name : "번호 없음";

    /// <summary>작은 글씨. 지사가 먼저, 그 다음 고객명과 큐를 있는 것만 잇는다.</summary>
    public string Subtitle
    {
        get
        {
            // 큰 글씨가 이미 이름이면 아래에 또 적지 않는다.
            var name = Title == CustomerName ? null : CustomerName;
            var parts = new[] { BranchLine, name, QueueName }
                .Where(part => !string.IsNullOrWhiteSpace(part));
            return string.Join(" · ", parts);
        }
    }
}
