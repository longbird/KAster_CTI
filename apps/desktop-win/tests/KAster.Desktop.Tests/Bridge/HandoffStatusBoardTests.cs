using KAster.Desktop.Core.Protocol;
using Xunit;

/// <summary>
/// 웹앱은 링크를 누른 뒤 이 PC 에 "그 토큰 어떻게 됐냐" 를 되물어 본다. 답할 것이 없으면
/// 웹 화면에는 16번 물어본 끝에 "데스크톱 앱이 자동 연결을 완료하지 못했습니다" 가 뜬다 —
/// 실제로는 연결됐는데도.
/// </summary>
public class HandoffStatusBoardTests
{
    [Fact]
    public void An_unknown_token_has_no_status()
    {
        Assert.Null(new HandoffStatusBoard().Find("nope"));
    }

    [Fact]
    public void The_last_mark_wins()
    {
        var board = new HandoffStatusBoard();

        board.Mark("t1", HandoffStatus.Pending);
        board.Mark("t1", HandoffStatus.Connected);

        Assert.Equal(HandoffState.Connected, board.Find("t1")!.State);
    }

    [Fact]
    public void A_failure_keeps_its_reason()
    {
        var board = new HandoffStatusBoard();

        board.Mark("t1", HandoffStatus.Failed("만료된 토큰입니다"));

        Assert.Equal(HandoffState.Failed, board.Find("t1")!.State);
        Assert.Equal("만료된 토큰입니다", board.Find("t1")!.Reason);
    }

    /// <summary>토큰은 계속 새로 생긴다. 한도를 안 두면 앱을 켜 둔 만큼 늘어난다.</summary>
    [Fact]
    public void Old_tokens_fall_off()
    {
        var board = new HandoffStatusBoard(capacity: 3);

        foreach (var n in new[] { "a", "b", "c", "d" }) board.Mark(n, HandoffStatus.Pending);

        Assert.Null(board.Find("a"));
        Assert.NotNull(board.Find("d"));
    }

    /// <summary>빈 토큰은 적지 않는다. 적으면 빈 조회가 남의 상태를 물려받는다.</summary>
    [Fact]
    public void A_blank_token_is_ignored()
    {
        var board = new HandoffStatusBoard();

        board.Mark("", HandoffStatus.Connected);
        board.Mark("   ", HandoffStatus.Connected);

        Assert.Null(board.Find(""));
        Assert.Null(board.Find("   "));
    }
}
