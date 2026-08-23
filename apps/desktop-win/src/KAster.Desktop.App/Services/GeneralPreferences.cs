using KAster.Desktop.Softphone.Audio;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 앱 전반의 동작. <b>기본값이 지금 동작과 같다</b> — 설정을 만들었다고 현장 동작이
/// 조용히 달라지면 안 된다.
///
/// <para>
/// 닫기 버튼을 트레이 최소화로 바꾸는 항목은 <b>일부러 넣지 않았다.</b> 서버는 앱이 붙어
/// 있는지로 큐 배정을 정한다. 트레이로 내려간 앱은 상담원이 껐다고 생각한 뒤에도 큐에 남아
/// 빈 자리로 전화를 받고, 고객은 아무도 없는 자리에서 벨소리만 듣는다. 창이 가려져 전화를
/// 놓치는 문제는 창을 숨기는 쪽이 아니라 알리는 쪽(풍선·깜빡임·벨소리)으로 푼다.
/// </para>
/// </summary>
public sealed record GeneralPreferences
{
    /// <summary>윈도우에 로그인하면 이 앱도 함께 뜬다.</summary>
    public bool AutoStart { get; init; }

    /// <summary>다른 창 위에 늘 보이게 둔다.</summary>
    public bool AlwaysOnTop { get; init; }

    public RingTonePreset RingTone { get; init; } = RingTonePreset.Classic;

    /// <summary>
    /// 파일을 손으로 고쳐 모르는 값이 들어와도 <b>전화가 조용히 오면 안 된다.</b>
    /// 무음은 상담원이 골랐을 때만이다.
    /// </summary>
    public GeneralPreferences Sane() => Enum.IsDefined(RingTone)
        ? this
        : this with { RingTone = RingTonePreset.Classic };
}
