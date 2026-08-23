using KAster.Desktop.Softphone.Audio;
using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 앱 전반의 동작. 기본값은 <b>지금 동작과 같아야 한다</b> — 설정을 만들었다고
/// 현장 동작이 조용히 달라지면 안 된다.
/// </summary>
public class GeneralPreferencesTests
{
    [Fact]
    public void The_defaults_keep_todays_behaviour()
    {
        var defaults = new GeneralPreferences();

        Assert.False(defaults.AutoStart);
        Assert.False(defaults.AlwaysOnTop);
        Assert.Equal(RingTonePreset.Classic, defaults.RingTone);
    }

    [Fact]
    public void An_unknown_preset_falls_back_instead_of_going_silent()
    {
        // 파일을 손으로 고쳐 이상한 값이 들어와도 전화가 조용히 오면 안 된다.
        var sane = new GeneralPreferences { RingTone = (RingTonePreset)99 }.Sane();

        Assert.Equal(RingTonePreset.Classic, sane.RingTone);
    }

    [Fact]
    public void A_chosen_preset_survives()
    {
        Assert.Equal(
            RingTonePreset.Silent,
            new GeneralPreferences { RingTone = RingTonePreset.Silent }.Sane().RingTone);
    }
}
