using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 서브 창을 어디에 띄울지. 메인 창을 가리면 서브 창을 열자마자 통화 화면이 사라지므로,
/// 상담원이 울리는 전화를 못 본다 — 그래서 옆에 세운다.
/// </summary>
public class SubWindowPlacementTests
{
    /// <summary>1920×1080 에서 작업 표시줄을 뺀 흔한 작업 영역.</summary>
    private static readonly WorkArea Screen = new(0, 0, 1920, 1040);

    /// <summary>대기 크기(440×560)의 메인 창이 화면 가운데쯤 있는 흔한 상태.</summary>
    private static readonly OwnerBounds Main = new(700, 100, 440, 560);

    [Fact]
    public void Opens_beside_the_main_window_so_it_does_not_cover_it()
    {
        var at = SubWindowPlacement.For(Screen, Main, 560, 720, alreadyOpen: 0);

        Assert.Equal(700 + 440 + 12, at.Left);
        Assert.Equal(100, at.Top);
    }

    [Fact]
    public void Falls_to_the_left_when_there_is_no_room_on_the_right()
    {
        var rightEdge = new OwnerBounds(1300, 100, 440, 560);

        var at = SubWindowPlacement.For(Screen, rightEdge, 560, 720, alreadyOpen: 0);

        Assert.Equal(1300 - 12 - 560, at.Left);
    }

    /// <summary>양쪽 다 안 들어가면 겹칠 수밖에 없다. 그래도 완전히 포개지지는 않게 민다.</summary>
    [Fact]
    public void Overlaps_with_an_offset_when_neither_side_fits()
    {
        var narrow = new WorkArea(0, 0, 1000, 1040);
        var owner = new OwnerBounds(200, 100, 440, 560);

        var at = SubWindowPlacement.For(narrow, owner, 560, 720, alreadyOpen: 0);

        Assert.Equal(200 + 28, at.Left);
        Assert.Equal(100, at.Top);
    }

    /// <summary>두 번째 창이 첫 번째와 정확히 겹치면 상담원은 창이 하나만 열린 줄 안다.</summary>
    [Fact]
    public void Stacks_a_second_sub_window_so_both_are_visible()
    {
        var at = SubWindowPlacement.For(Screen, Main, 560, 720, alreadyOpen: 1);

        Assert.Equal(700 + 440 + 12, at.Left);
        Assert.Equal(100 + 28, at.Top);
    }

    [Fact]
    public void Pulls_a_sub_window_that_would_fall_off_the_bottom_back_inside()
    {
        var low = new OwnerBounds(700, 600, 440, 560);

        var at = SubWindowPlacement.For(Screen, low, 560, 720, alreadyOpen: 0);

        Assert.Equal(1040 - 720, at.Top);
    }

    [Fact]
    public void Honours_the_work_area_offset_of_a_second_monitor()
    {
        var second = new WorkArea(1920, 0, 1280, 1000);
        var owner = new OwnerBounds(2000, 100, 440, 560);

        var at = SubWindowPlacement.For(second, owner, 560, 720, alreadyOpen: 0);

        Assert.Equal(2000 + 440 + 12, at.Left);
        Assert.Equal(100, at.Top);
    }

    /// <summary>작업 영역이 서브 창보다 작아도 창이 화면 밖으로 나가면 안 된다.</summary>
    [Fact]
    public void A_work_area_smaller_than_the_sub_window_pins_it_to_the_top_left()
    {
        var tiny = new WorkArea(0, 0, 300, 300);
        var owner = new OwnerBounds(0, 0, 440, 560);

        var at = SubWindowPlacement.For(tiny, owner, 560, 720, alreadyOpen: 0);

        Assert.Equal(0, at.Left);
        Assert.Equal(0, at.Top);
    }

    /// <summary>메인 창이 화면 왼쪽 밖에 걸쳐 있어도 서브 창은 작업 영역 안에서 시작한다.</summary>
    [Fact]
    public void A_main_window_hanging_off_the_left_still_gets_a_sub_window_inside_the_screen()
    {
        var owner = new OwnerBounds(-200, -100, 440, 560);

        var at = SubWindowPlacement.For(Screen, owner, 560, 720, alreadyOpen: 0);

        Assert.Equal(-200 + 440 + 12, at.Left);
        Assert.Equal(0, at.Top);
    }
}
