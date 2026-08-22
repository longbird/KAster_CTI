namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 이 PC 에서 읽은 공지.
///
/// 서버에 남기지 않는 이유는 <b>남길 길이 없기 때문</b>이다 — 읽음 처리 경로
/// (<c>POST admin/announcements/{id}/read</c>)는 supervisor/admin 전용이라 상담원이 부르면 403 이다.
///
/// <see cref="AgentId"/> 를 함께 적는 이유는 교대 근무다. 같은 PC 에 다음 상담원이 앉는데
/// 앞사람이 읽은 것을 읽었다고 하면, 뒷사람은 그 공지를 영영 못 본다.
/// </summary>
public sealed record AnnouncementReadState
{
    public string AgentId { get; init; } = string.Empty;

    /// <summary>
    /// 읽은 공지의 id. 서버가 더 이상 내려주지 않는 공지의 표시는 조회할 때마다 걷어 낸다 —
    /// 안 걷어 내면 이 목록이 끝없이 자란다.
    /// </summary>
    public IReadOnlyList<string> ReadIds { get; init; } = Array.Empty<string>();
}
