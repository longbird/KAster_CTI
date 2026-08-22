namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 서브 창으로 뜨는 읽기 전용 화면들.
///
/// <see cref="Services.WindowMode"/> 를 늘리지 않는 이유는 그 enum 의 뜻이 <b>통화 단계</b>이기
/// 때문이다. 거기에 이것들을 섞으면 통화 상태 기계의 switch 마다 뜻 없는 가지가 생긴다.
/// </summary>
public enum InfoWindow
{
    AgentDirectory,
    QueueStatus,
    Announcements,
    CustomerInfo,
}
