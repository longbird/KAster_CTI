using KAster.Desktop.App.Services;

namespace KAster.Desktop.Tests.App;

public class CallPreferencesTests
{
    /// <summary>
    /// 기본값은 지금까지 코드에 박혀 있던 값 그대로다. 설정을 만들었다고 현장의 동작이
    /// 조용히 달라지면 안 된다.
    /// </summary>
    [Fact]
    public void The_defaults_are_what_the_code_used_to_do()
    {
        var defaults = new CallPreferences();

        Assert.Equal(45, defaults.SelfAnswerWindowSeconds);
        Assert.Equal(5, defaults.PbxResponseWaitSeconds);
    }

    /// <summary>
    /// 설정 파일은 손으로 고칠 수 있다. 자동응답 대기가 0 이면 자기가 건 전화를 영영 못 받고,
    /// 3600 이면 한 시간 동안 걸려 오는 <b>고객 전화</b>를 말없이 받는다.
    /// </summary>
    [Theory]
    [InlineData(0, 5)]
    [InlineData(-30, 5)]
    [InlineData(3, 5)]
    [InlineData(45, 45)]
    [InlineData(180, 180)]
    [InlineData(3600, 180)]
    public void The_self_answer_window_is_held_inside_what_makes_sense(int given, int used)
    {
        Assert.Equal(used, new CallPreferences { SelfAnswerWindowSeconds = given }.Sane().SelfAnswerWindowSeconds);
    }

    /// <summary>
    /// PBX 응답 대기가 0 이면 보류 버튼이 눌리자마자 "응답하지 않았다" 가 뜨고,
    /// 너무 길면 안 먹은 보류를 상담원이 하염없이 기다린다.
    /// </summary>
    [Theory]
    [InlineData(0, 2)]
    [InlineData(1, 2)]
    [InlineData(5, 5)]
    [InlineData(30, 30)]
    [InlineData(600, 30)]
    public void The_pbx_wait_is_held_inside_what_makes_sense(int given, int used)
    {
        Assert.Equal(used, new CallPreferences { PbxResponseWaitSeconds = given }.Sane().PbxResponseWaitSeconds);
    }

    [Fact]
    public void Values_that_are_already_sensible_come_back_unchanged()
    {
        var kept = new CallPreferences { SelfAnswerWindowSeconds = 60, PbxResponseWaitSeconds = 8 };

        Assert.Equal(kept, kept.Sane());
    }
}
