namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 당겨받을 전화를 어떻게 늘어놓을지.
///
/// 한두 건이면 어느 쪽이든 상관없지만, 대기가 쌓이면 얘기가 달라진다.
/// 목록은 한 건씩 고객명과 큐까지 읽고, 타일은 여러 건을 한눈에 본다.
/// 자리마다 선호가 다르므로 고르게 둔다.
/// </summary>
public enum WaitingCallLayout
{
    /// <summary>한 줄에 하나. 고객명과 큐를 함께 읽는다.</summary>
    List,

    /// <summary>한 줄에 둘. 번호 위주로 여러 건을 한눈에 본다.</summary>
    Tile,
}
