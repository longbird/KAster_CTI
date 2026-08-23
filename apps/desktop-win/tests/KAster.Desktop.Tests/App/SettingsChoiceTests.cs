using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Softphone.Audio;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 고르는 목록에 뜨는 글자. 값을 그대로 보여 주면 한글 화면에 <c>System</c> · <c>Classic</c> 같은
/// 영어가 뜬다 — 상담원이 무엇을 고르는지 모른다.
///
/// <b>빠진 값이 없어야 한다.</b> 하나만 빠져도 그 항목만 영어로 뜨고, 대개 새로 추가한 값이 빠진다.
/// </summary>
public class SettingsChoiceTests
{
    [Fact]
    public void Every_theme_has_korean_words()
    {
        foreach (var theme in Enum.GetValues<AppTheme>())
        {
            var label = SettingsChoices.Themes.Single(c => c.Value == theme).Label;

            Assert.NotEmpty(label);
            Assert.DoesNotContain(theme.ToString(), label, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Every_ring_tone_has_korean_words()
    {
        foreach (var tone in Enum.GetValues<RingTonePreset>())
        {
            var label = SettingsChoices.RingTones.Single(c => c.Value == tone).Label;

            Assert.NotEmpty(label);
            Assert.DoesNotContain(tone.ToString(), label, StringComparison.Ordinal);
        }
    }

    /// <summary>화면이 고른 값을 그대로 돌려줘야 저장이 맞는다.</summary>
    [Fact]
    public void A_choice_carries_its_value()
    {
        Assert.Equal(AppTheme.Dark, SettingsChoices.Themes.Single(c => c.Label.Contains("어둡게")).Value);
        Assert.Equal(RingTonePreset.Silent, SettingsChoices.RingTones.Single(c => c.Label.Contains("무음")).Value);
    }
}
