using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 트레이 아이콘이 지금 무엇을 말하는가. 상담원이 다른 프로그램을 보고 있을 때 이 아이콘 하나가
/// 유일한 창구다 — 여기서 틀린 것을 말하면 전화가 안 오는 자리를 정상으로 읽는다.
/// </summary>
public sealed class TrayPresentationTests
{
    private static TrayState For(
        bool isConnected = true,
        bool isPhoneRegistered = true,
        WindowMode mode = WindowMode.Idle,
        AgentStatusCode status = AgentStatusCode.Available)
        => TrayPresentation.For(isConnected, isPhoneRegistered, mode, status, "김상담", "1001");

    [Fact]
    public void An_idle_seat_that_can_take_calls_says_so()
    {
        var state = For();

        Assert.Equal(TrayStatus.Available, state.Status);
        Assert.Contains("대기 중", state.Tooltip);
    }

    /// <summary>이름과 내선이 없으면 한 PC 에 두 상담원이 떠 있을 때 어느 아이콘이 누구인지 알 수 없다.</summary>
    [Fact]
    public void The_tooltip_names_whose_seat_this_is()
    {
        var state = For();

        Assert.Contains("김상담", state.Tooltip);
        Assert.Contains("1001", state.Tooltip);
    }

    [Fact]
    public void A_break_looks_different_from_waiting()
    {
        Assert.Equal(TrayStatus.Break, For(status: AgentStatusCode.Break).Status);
    }

    /// <summary>
    /// 전화기가 등록돼 있지 않으면 전화가 한 통도 오지 않는다. 그 자리를 "대기 중" 으로 칠하면
    /// 상담원은 조용한 이유를 한가한 시간대로 읽는다.
    /// </summary>
    [Fact]
    public void An_unregistered_phone_is_not_painted_as_waiting()
    {
        var state = For(isPhoneRegistered: false);

        Assert.Equal(TrayStatus.PhoneDown, state.Status);
        Assert.Contains("전화기", state.Tooltip);
    }

    [Fact]
    public void A_dead_server_link_is_said_out_loud()
    {
        var state = For(isConnected: false);

        Assert.Equal(TrayStatus.Disconnected, state.Status);
        Assert.Contains("서버", state.Tooltip);
    }

    /// <summary>
    /// 통화는 소리가 SIP 로 흐르므로 웹소켓이 끊겨도 이어진다. 그때 아이콘을 "서버 끊김" 으로
    /// 바꾸면 통화 중인 자리가 비어 보인다 — 지금 벌어지는 일이 먼저다.
    /// </summary>
    [Fact]
    public void A_live_call_outranks_a_dead_server_link()
    {
        Assert.Equal(TrayStatus.Talking, For(isConnected: false, mode: WindowMode.Talking).Status);
    }

    [Theory]
    [InlineData(WindowMode.Talking)]
    [InlineData(WindowMode.Transferring)]
    [InlineData(WindowMode.AfterCall)]
    public void Every_stage_of_a_live_call_reads_as_talking(WindowMode mode)
    {
        Assert.Equal(TrayStatus.Talking, For(mode: mode).Status);
    }

    [Fact]
    public void A_ringing_call_gets_its_own_look()
    {
        var state = For(mode: WindowMode.Ringing);

        Assert.Equal(TrayStatus.Ringing, state.Status);
        Assert.Contains("수신", state.Tooltip);
    }

    /// <summary>이력 창(Settings 모드)은 통화가 아니다. 통화 중으로 칠하면 안 된다.</summary>
    [Fact]
    public void Looking_at_history_is_not_a_call()
    {
        Assert.Equal(TrayStatus.Available, For(mode: WindowMode.Settings).Status);
    }

    // ---- 수신 중 깜빡임 -------------------------------------------------------
    //
    // 트레이 풍선은 윈도우의 알림 설정·집중 지원이 조용히 삼킬 수 있다. 그것 하나에 기대면
    // 알림이 통째로 사라지는 상담원 자리가 생긴다. 아이콘 깜빡임은 우리가 직접 그리는 것이라
    // 어떤 설정으로도 꺼지지 않는다.

    /// <summary>제안이 떠 있지 않은 상태에서 아이콘이 흔들리면 그냥 시끄러운 앱이다.</summary>
    [Theory]
    [InlineData(TrayStatus.Available)]
    [InlineData(TrayStatus.Talking)]
    [InlineData(TrayStatus.Break)]
    [InlineData(TrayStatus.Disconnected)]
    [InlineData(TrayStatus.PhoneDown)]
    public void Nothing_but_a_ringing_call_blinks(TrayStatus status)
    {
        var state = new TrayState(status, "t");

        Assert.False(TrayBlink.For(state, 0).Attention);
        Assert.False(TrayBlink.For(state, 1).Attention);
    }

    [Fact]
    public void A_ringing_call_alternates_every_tick()
    {
        var state = new TrayState(TrayStatus.Ringing, "t");

        Assert.False(TrayBlink.For(state, 0).Attention);
        Assert.True(TrayBlink.For(state, 1).Attention);
        Assert.False(TrayBlink.For(state, 2).Attention);
    }

    /// <summary>두 프레임이 같은 색이면 깜빡이지 않는 것과 같다.</summary>
    [Fact]
    public void The_two_blink_frames_are_different_colours()
    {
        var off = TrayPresentation.BrushKeyFor(TrayStatus.Ringing, attention: false);
        var on = TrayPresentation.BrushKeyFor(TrayStatus.Ringing, attention: true);

        Assert.NotEqual(off, on);
    }

    /// <summary>
    /// 깜빡이는 동안에도 툴팁은 그대로다. 문구가 매 틱 바뀌면 상담원이 읽는 도중에 글자가 흔들린다.
    /// </summary>
    [Fact]
    public void Blinking_does_not_disturb_the_tooltip()
    {
        var state = For(mode: WindowMode.Ringing);

        Assert.Equal(state.Tooltip, TrayBlink.For(state, 1).Tooltip);
    }

    /// <summary>색상 리터럴은 Tokens.xaml 에만 둔다. 트레이도 화면과 같은 표를 봐야 한다.</summary>
    [Theory]
    [InlineData(TrayStatus.Disconnected, "BrushDanger")]
    [InlineData(TrayStatus.PhoneDown, "BrushDanger")]
    [InlineData(TrayStatus.Break, "BrushTextMuted")]
    [InlineData(TrayStatus.Available, "BrushSuccess")]
    [InlineData(TrayStatus.Ringing, "BrushWarning")]
    [InlineData(TrayStatus.Talking, "BrushAccent")]
    public void Every_status_paints_itself_from_a_theme_token(TrayStatus status, string expected)
    {
        Assert.Equal(expected, TrayPresentation.BrushKeyFor(status));
    }
}
