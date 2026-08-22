namespace KAster.Desktop.App.Services;

/// <summary>전역 핫키가 부르는 동작.</summary>
public enum HotkeyAction
{
    Answer,
    Hangup,
    ToggleMute,
}

/// <summary>
/// 상담원이 고른 조합. 값은 사람이 읽고 쓰는 글자로 둔다 ("Ctrl+Shift+F9") —
/// 가상 키 코드로 저장하면 설정 파일을 열어도 무슨 키인지 알 수 없다.
///
/// 화면은 아직 없다. 지금은 저장 구조와 기본값만 서 있고, 고르는 화면은 환경설정 라운드에 붙는다.
/// </summary>
public sealed record HotkeySettings
{
    /// <summary>
    /// 기본값은 <c>Ctrl+Shift+F8~F10</c> 이다. 수식키 둘을 겹쳐 두는 이유는 다른 프로그램과
    /// 부딪힐 자리를 줄이기 위해서다 — 전역 핫키는 먼저 잡은 프로그램이 이긴다.
    /// </summary>
    public string Answer { get; init; } = "Ctrl+Shift+F9";

    public string Hangup { get; init; } = "Ctrl+Shift+F10";

    /// <summary>
    /// 마이크. 받기·끊기 다음으로 창을 안 보고 누르는 일이 잦다 — 옆자리와 이야기하려고
    /// 창을 찾아 올리는 동안 고객에게 다 들린다.
    /// </summary>
    public string ToggleMute { get; init; } = "Ctrl+Shift+F8";
}
