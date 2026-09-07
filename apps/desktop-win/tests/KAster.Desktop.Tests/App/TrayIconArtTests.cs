using KAster.Desktop.App.Services;
using System.Windows.Media;
using Drawing = System.Drawing;

namespace KAster.Desktop.Tests.App;

public sealed class TrayIconArtTests
{
    private static Color? Theme(string token) => token switch
    {
        "BrushSuccess" => Colors.Green,
        "BrushDanger" => Colors.Red,
        "BrushWarning" => Colors.Yellow,
        _ => Colors.Gray,
    };

    [Fact]
    public void Artwork_renders_without_application_and_reuses_cached_frame()
    {
        // No Application instance or pack URI registration is needed by this service.
        using var art = new TrayIconArt(Theme);
        var first = art.For(TrayStatus.Available);
        Assert.Equal(32, first.Width);
        Assert.Same(first, art.For(TrayStatus.Available));
    }

    [Fact]
    public void Invalidate_renders_changed_theme_instead_of_reusing_old_frame()
    {
        var color = Colors.Green;
        using var art = new TrayIconArt(_ => color);
        var old = art.For(TrayStatus.Available);
        var before = BadgePixel(old);
        color = Colors.Blue;
        art.Invalidate();
        var current = art.For(TrayStatus.Available);
        Assert.NotSame(old, current);
        Assert.NotEqual(before, BadgePixel(current));
        Assert.Equal(Drawing.Color.Blue.ToArgb(), BadgePixel(current));
    }

    [Fact]
    public void Status_and_attention_change_badge_but_keep_brand_artwork()
    {
        using var art = new TrayIconArt(Theme);
        var available = art.For(TrayStatus.Available);
        var disconnected = art.For(TrayStatus.Disconnected);
        var ringing = art.For(TrayStatus.Ringing);
        var attention = art.For(TrayStatus.Ringing, attention: true);
        Assert.NotEqual(BadgePixel(available), BadgePixel(disconnected));
        Assert.NotEqual(BadgePixel(ringing), BadgePixel(attention));
        Assert.Same(attention, art.For(TrayStatus.Ringing, attention: true));
        using var first = available.ToBitmap();
        using var second = attention.ToBitmap();
        // The center of the indigo tile is outside the status badge.
        Assert.Equal(first.GetPixel(16, 16), second.GetPixel(16, 16));
        Assert.Equal(Drawing.Color.FromArgb(90, 85, 214), first.GetPixel(16, 16));
    }

    private static int BadgePixel(Drawing.Icon icon)
    {
        using var bitmap = icon.ToBitmap();
        return bitmap.GetPixel(26, 26).ToArgb();
    }
}
