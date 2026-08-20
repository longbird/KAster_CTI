using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

public class WindowBoundsTests
{
    /// <summary>1920×1080 에서 작업 표시줄을 뺀 흔한 작업 영역.</summary>
    private static readonly WorkArea Screen = new(0, 0, 1920, 1040);

    [Theory]
    [InlineData(WindowMode.Idle, 440, 560, 420, 520)]
    [InlineData(WindowMode.Ringing, 440, 420, 400, 380)]
    [InlineData(WindowMode.Talking, 460, 620, 420, 540)]
    [InlineData(WindowMode.Transferring, 500, 640, 440, 560)]
    [InlineData(WindowMode.AfterCall, 460, 520, 420, 460)]
    [InlineData(WindowMode.Settings, 560, 720, 500, 640)]
    public void Each_mode_keeps_the_size_the_existing_app_uses(
        WindowMode mode, double width, double height, double minWidth, double minHeight)
    {
        var bounds = WindowBounds.For(mode, Screen, null);

        Assert.Equal(width, bounds.Width);
        Assert.Equal(height, bounds.Height);
        Assert.Equal(minWidth, bounds.MinWidth);
        Assert.Equal(minHeight, bounds.MinHeight);
    }

    [Fact]
    public void Pulls_a_window_that_hangs_off_the_right_edge_back_inside()
    {
        var bounds = WindowBounds.For(WindowMode.Talking, Screen, new WindowPosition(1800, 100));

        Assert.Equal(1920 - 460, bounds.Left);
    }

    [Fact]
    public void Pulls_a_window_that_hangs_off_the_bottom_edge_back_inside()
    {
        var bounds = WindowBounds.For(WindowMode.Talking, Screen, new WindowPosition(100, 1000));

        Assert.Equal(1040 - 620, bounds.Top);
    }

    [Fact]
    public void Pulls_a_window_with_a_negative_position_back_inside()
    {
        var bounds = WindowBounds.For(WindowMode.Idle, Screen, new WindowPosition(-300, -200));

        Assert.Equal(0, bounds.Left);
        Assert.Equal(0, bounds.Top);
    }

    [Fact]
    public void Honours_the_work_area_offset_of_a_second_monitor()
    {
        var second = new WorkArea(1920, 0, 1280, 1000);

        var bounds = WindowBounds.For(WindowMode.Idle, second, new WindowPosition(3200, 0));

        Assert.Equal(1920 + 1280 - 440, bounds.Left);
    }

    [Fact]
    public void Keeps_a_position_that_already_fits()
    {
        var bounds = WindowBounds.For(WindowMode.Idle, Screen, new WindowPosition(300, 200));

        Assert.Equal(300, bounds.Left);
        Assert.Equal(200, bounds.Top);
    }

    [Fact]
    public void Centres_the_window_when_there_is_no_saved_position()
    {
        var bounds = WindowBounds.For(WindowMode.Idle, Screen, null);

        Assert.Equal((1920 - 440) / 2, bounds.Left);
        Assert.Equal((1040 - 560) / 2, bounds.Top);
    }

    [Fact]
    public void An_unknown_mode_falls_back_to_idle()
    {
        var bounds = WindowBounds.For((WindowMode)99, Screen, null);

        Assert.Equal(440, bounds.Width);
        Assert.Equal(560, bounds.Height);
    }

    [Fact]
    public void A_work_area_smaller_than_the_window_does_not_push_it_off_the_left()
    {
        var tiny = new WorkArea(0, 0, 300, 300);

        var bounds = WindowBounds.For(WindowMode.Idle, tiny, new WindowPosition(0, 0));

        Assert.Equal(0, bounds.Left);
        Assert.Equal(0, bounds.Top);
    }
}
