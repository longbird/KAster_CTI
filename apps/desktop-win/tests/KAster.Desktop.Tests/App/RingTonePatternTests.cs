using KAster.Desktop.App.Services;
using KAster.Desktop.Softphone.Audio;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 벨소리는 파일이 아니라 만들어 낸다 — 음원을 같이 배포하면 라이선스와 설치 크기가 붙고,
/// 현장마다 스피커가 달라 파일 하나로 다 맞출 수도 없다.
/// </summary>
public class RingTonePatternTests
{
    [Fact]
    public void Silent_makes_no_sound()
    {
        var pattern = RingTonePattern.For(RingTonePreset.Silent);

        Assert.True(pattern.IsSilent);
    }

    [Fact]
    public void The_others_all_make_sound()
    {
        foreach (var preset in new[] { RingTonePreset.Classic, RingTonePreset.Soft, RingTonePreset.Urgent })
        {
            Assert.False(RingTonePattern.For(preset).IsSilent);
        }
    }

    /// <summary>한 주기는 울리는 구간과 쉬는 구간을 합친 길이다. 쉬지 않으면 소리가 끊기지 않는다.</summary>
    [Fact]
    public void A_cycle_rings_then_rests()
    {
        var pattern = RingTonePattern.For(RingTonePreset.Classic);

        Assert.True(pattern.OnMilliseconds > 0);
        Assert.True(pattern.OffMilliseconds > 0);
    }

    /// <summary>급한 벨은 더 자주 울려야 한다. 그러라고 고르는 것이다.</summary>
    [Fact]
    public void Urgent_repeats_faster_than_soft()
    {
        var urgent = RingTonePattern.For(RingTonePreset.Urgent);
        var soft = RingTonePattern.For(RingTonePreset.Soft);

        Assert.True(urgent.OnMilliseconds + urgent.OffMilliseconds
            < soft.OnMilliseconds + soft.OffMilliseconds);
    }

    /// <summary>전화 벨 대역이다. 너무 낮으면 작은 스피커에서 안 들리고 너무 높으면 귀에 거슬린다.</summary>
    [Fact]
    public void The_tones_stay_in_the_telephone_band()
    {
        foreach (var preset in new[] { RingTonePreset.Classic, RingTonePreset.Soft, RingTonePreset.Urgent })
        {
            foreach (var hz in RingTonePattern.For(preset).Frequencies)
            {
                Assert.InRange(hz, 300, 2000);
            }
        }
    }

    /// <summary>한 주기만큼 만들면 그 길이만큼 나온다. 이어 붙이면 끊김 없이 계속 울린다.</summary>
    [Fact]
    public void One_cycle_of_samples_matches_the_cycle_length()
    {
        var pattern = RingTonePattern.For(RingTonePreset.Classic);

        var samples = RingToneGenerator.Cycle(pattern, sampleRate: 8000);

        var expected = 8000 * (pattern.OnMilliseconds + pattern.OffMilliseconds) / 1000;
        Assert.Equal(expected, samples.Length);
    }

    /// <summary>쉬는 구간은 진짜로 무음이어야 한다. 안 그러면 계속 울리는 소리가 된다.</summary>
    [Fact]
    public void The_rest_of_the_cycle_is_actually_silent()
    {
        var pattern = RingTonePattern.For(RingTonePreset.Classic);
        var samples = RingToneGenerator.Cycle(pattern, sampleRate: 8000);

        var restStarts = 8000 * pattern.OnMilliseconds / 1000;
        Assert.All(samples[restStarts..], sample => Assert.Equal(0f, sample));
    }
}
