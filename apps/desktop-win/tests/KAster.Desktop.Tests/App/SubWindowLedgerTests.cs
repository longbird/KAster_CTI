using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 열린 서브 창 장부. 창 자체는 WPF 라 테스트할 수 없지만, "두 번 열지 않는다" 와
/// "로그아웃하면 다 닫는다" 는 창 없이 확인할 수 있어야 한다.
/// </summary>
public class SubWindowLedgerTests
{
    private sealed record FakeWindow(string Name);

    [Fact]
    public void Asking_for_a_window_that_is_already_open_surfaces_it_instead_of_making_a_second_one()
    {
        var ledger = new SubWindowLedger<FakeWindow>();
        var created = 0;
        var surfaced = new List<FakeWindow>();

        var first = ledger.OpenOrSurface("settings", () => new FakeWindow($"w{++created}"), surfaced.Add);
        var again = ledger.OpenOrSurface("settings", () => new FakeWindow($"w{++created}"), surfaced.Add);

        Assert.Equal(1, created);
        Assert.Same(first, again);
        Assert.Equal(new[] { first }, surfaced);
        Assert.Equal(1, ledger.Count);
    }

    [Fact]
    public void Different_windows_open_side_by_side()
    {
        var ledger = new SubWindowLedger<FakeWindow>();

        ledger.OpenOrSurface("settings", () => new FakeWindow("settings"), _ => { });
        ledger.OpenOrSurface("history", () => new FakeWindow("history"), _ => { });

        Assert.Equal(2, ledger.Count);
    }

    /// <summary>
    /// 창을 닫으면 창 쪽 Closed 처리기가 같은 장부에서 자기를 지운다. 장부를 돌면서 닫으면
    /// 그 자리에서 컬렉션이 바뀌어 터진다 — 그래서 스냅샷을 넘기고 장부는 먼저 비운다.
    /// </summary>
    [Fact]
    public void Closing_all_hands_back_every_open_window_and_survives_each_one_forgetting_itself()
    {
        var ledger = new SubWindowLedger<FakeWindow>();
        ledger.OpenOrSurface("settings", () => new FakeWindow("settings"), _ => { });
        ledger.OpenOrSurface("history", () => new FakeWindow("history"), _ => { });

        var closing = ledger.Drain();
        foreach (var window in closing) ledger.Forget(window.Name);

        Assert.Equal(2, closing.Count);
        Assert.Equal(0, ledger.Count);
    }

    /// <summary>화면 안쪽 "닫기" 버튼이 자기 창을 찾는 경로.</summary>
    [Fact]
    public void An_open_window_can_be_found_by_key_and_a_closed_one_cannot()
    {
        var ledger = new SubWindowLedger<FakeWindow>();
        ledger.OpenOrSurface("settings", () => new FakeWindow("settings"), _ => { });

        Assert.True(ledger.TryGet("settings", out var found));
        Assert.Equal(new FakeWindow("settings"), found);
        Assert.False(ledger.TryGet("history", out _));
    }

    /// <summary>상담원이 X 로 닫은 창은 다음에 다시 열려야 한다. 장부에 남아 있으면 영영 안 열린다.</summary>
    [Fact]
    public void A_window_that_closed_on_its_own_opens_again_next_time()
    {
        var ledger = new SubWindowLedger<FakeWindow>();
        var created = 0;

        ledger.OpenOrSurface("settings", () => new FakeWindow($"w{++created}"), _ => { });
        ledger.Forget("settings");
        ledger.OpenOrSurface("settings", () => new FakeWindow($"w{++created}"), _ => { });

        Assert.Equal(2, created);
        Assert.Equal(1, ledger.Count);
    }
}
