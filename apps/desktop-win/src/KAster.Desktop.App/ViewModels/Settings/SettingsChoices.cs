using KAster.Desktop.App.Services;
using KAster.Desktop.Softphone.Audio;

namespace KAster.Desktop.App.ViewModels;

/// <summary>고르는 목록의 한 줄. 화면은 <see cref="Label"/> 을 보여 주고 <see cref="Value"/> 를 저장한다.</summary>
public sealed record Choice<T>(T Value, string Label);

/// <summary>
/// 설정 화면의 고르는 목록.
///
/// 값을 그대로 보여 주면 한글 화면에 <c>System</c> · <c>Classic</c> 같은 영어가 뜬다.
/// 목록을 한 곳에 모아 두면 값이 늘었을 때 빠뜨린 것을 테스트가 잡는다.
/// </summary>
public static class SettingsChoices
{
    public static IReadOnlyList<Choice<AppTheme>> Themes { get; } = new[]
    {
        new Choice<AppTheme>(AppTheme.System, "시스템 따름"),
        new Choice<AppTheme>(AppTheme.Light, "밝게"),
        new Choice<AppTheme>(AppTheme.Dark, "어둡게"),
    };

    public static IReadOnlyList<Choice<RingTonePreset>> RingTones { get; } = new[]
    {
        new Choice<RingTonePreset>(RingTonePreset.Classic, "기본"),
        new Choice<RingTonePreset>(RingTonePreset.Soft, "부드럽게"),
        new Choice<RingTonePreset>(RingTonePreset.Urgent, "급하게"),
        new Choice<RingTonePreset>(RingTonePreset.Silent, "무음"),
    };
}
