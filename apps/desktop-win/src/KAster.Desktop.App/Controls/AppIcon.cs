using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace KAster.Desktop.App.Controls;

/// <summary>Shared 24-unit line artwork. Foreground follows the containing control.</summary>
public sealed class AppIcon : Control
{
    public static readonly DependencyProperty KindProperty = DependencyProperty.Register(
        nameof(Kind), typeof(string), typeof(AppIcon), new FrameworkPropertyMetadata("Headset", FrameworkPropertyMetadataOptions.AffectsRender));
    public static readonly DependencyProperty SizeProperty = DependencyProperty.Register(
        nameof(Size), typeof(double), typeof(AppIcon), new FrameworkPropertyMetadata(20d, FrameworkPropertyMetadataOptions.AffectsMeasure));

    public string Kind { get => (string)GetValue(KindProperty); set => SetValue(KindProperty, value); }
    public double Size { get => (double)GetValue(SizeProperty); set => SetValue(SizeProperty, value); }

    public AppIcon()
    {
        Focusable = false;
        IsHitTestVisible = false;
        HorizontalAlignment = HorizontalAlignment.Center;
        VerticalAlignment = VerticalAlignment.Center;
    }

    protected override Size MeasureOverride(Size constraint) => new(Size, Size);

    protected override void OnRender(DrawingContext dc)
    {
        base.OnRender(dc);
        var scale = Math.Min(ActualWidth, ActualHeight) / 24;
        dc.PushTransform(new TranslateTransform((ActualWidth - scale * 24) / 2, (ActualHeight - scale * 24) / 2));
        dc.PushTransform(new ScaleTransform(scale, scale));
        Draw(dc, "Icon" + Kind, Kind == "Keypad" ? 3 : 1.7);
        if (Kind == "Settings") Draw(dc, "IconSettingsDetail", 4);
        dc.Pop();
        dc.Pop();
    }

    private void Draw(DrawingContext dc, string key, double thickness)
    {
        if (TryFindResource(key) is not Geometry geometry) return;
        var pen = new Pen(Foreground, thickness) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round, LineJoin = PenLineJoin.Round };
        dc.DrawGeometry(null, pen, geometry);
    }
}
