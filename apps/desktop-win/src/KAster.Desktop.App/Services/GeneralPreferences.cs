using KAster.Desktop.Softphone.Audio;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 앱 전반의 동작. <b>기본값이 지금 동작과 같다</b> — 설정을 만들었다고 현장 동작이
/// 조용히 달라지면 안 된다.
///
/// <para>
/// 닫기 버튼을 트레이 최소화로 바꾸는 항목(<see cref="CloseToTray"/>)은 <b>자리비움과 한 몸</b>이다.
/// 서버는 앱이 붙어 있는지로 큐 배정을 정하므로, 상태를 안 바꾸면 상담원이 껐다고 생각한
/// 자리로 전화가 가고 고객은 아무도 없는 자리에서 벨소리만 듣는다. 그래서 트레이로 내려갈 때
/// 반드시 자리비움으로 바꾸고, 그 사실을 풍선으로 알린다.
/// </para>
/// </summary>
public sealed record GeneralPreferences
{
    /// <summary>윈도우에 로그인하면 이 앱도 함께 뜬다.</summary>
    public bool AutoStart { get; init; }

    /// <summary>다른 창 위에 늘 보이게 둔다.</summary>
    public bool AlwaysOnTop { get; init; }

    /// <summary>
    /// 색 테마. 기본은 윈도우를 따라간다 — 현장에 어두운 상담실과 밝은 사무실이 섞여 있고,
    /// 어느 한쪽을 못박으면 나머지 절반이 매번 설정을 고쳐야 한다.
    /// </summary>
    public AppTheme Theme { get; init; } = AppTheme.System;

    /// <summary>
    /// 닫기 버튼을 눌러도 끝나지 않고 트레이로 내려간다. <b>내려갈 때 자리비움으로 바뀐다.</b>
    ///
    /// 기본값은 꺼짐이다 — 지금까지 X 는 종료였고, 설정을 만들었다고 그 뜻이 조용히
    /// 달라지면 상담원은 껐다고 생각한 앱이 계속 도는 것을 모른다.
    /// </summary>
    public bool CloseToTray { get; init; }

    public RingTonePreset RingTone { get; init; } = RingTonePreset.Classic;

    /// <summary>
    /// 파일을 손으로 고쳐 모르는 값이 들어와도 <b>전화가 조용히 오면 안 된다.</b>
    /// 무음은 상담원이 골랐을 때만이다.
    /// </summary>
    public GeneralPreferences Sane()
    {
        var sane = Enum.IsDefined(RingTone) ? this : this with { RingTone = RingTonePreset.Classic };

        // 모르는 테마 값이면 화면이 검은 사각형이 된다. 윈도우를 따라가는 쪽으로 접는다.
        return Enum.IsDefined(sane.Theme) ? sane : sane with { Theme = AppTheme.System };
    }
}
