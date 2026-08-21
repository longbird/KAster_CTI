namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 당겨받을 수 있는 전화 한 줄. 상담원이 받을지 말지 고르는 데 필요한 것만 담는다 —
/// 누가 걸었는지, 어느 큐인지.
/// </summary>
public sealed record WaitingCall(string CallId, string PhoneNumber, string? CustomerName, string? QueueName)
{
    /// <summary>화면에 한 줄로 보일 이름. 고객명을 모르면 번호가 대신한다.</summary>
    public string Title => CustomerName ?? PhoneNumber;

    public string Subtitle => string.IsNullOrWhiteSpace(QueueName)
        ? PhoneNumber
        : $"{QueueName} · {PhoneNumber}";
}
