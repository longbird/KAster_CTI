using KAster.Desktop.Softphone.Audio;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 앱 전반의 동작. <b>기본값이 지금 동작과 같다</b> — 설정을 만들었다고 현장 동작이
/// 조용히 달라지면 안 된다.
///
/// <para>
/// 닫기는 매번 종료와 트레이 숨김을 선택한다. 숨김은 상담 상태를 변경하지 않는다.
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
    /// 이전 버전의 설정 파일 호환용. 현재 닫기 동작은 이 값과 무관하게 선택창을 표시한다.
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
