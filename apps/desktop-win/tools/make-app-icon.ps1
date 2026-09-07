# Render the same headset Geometry used by AppIcon into a multi-resolution Windows icon.
# Run with Windows PowerShell: powershell -STA -File tools/make-app-icon.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore, PresentationFramework, WindowsBase
$appRoot = Join-Path $PSScriptRoot '../src/KAster.Desktop.App'
[xml]$icons = Get-Content -LiteralPath (Join-Path $appRoot 'Themes/Icons.xaml') -Raw
$headsetNode = $icons.ResourceDictionary.Geometry | Where-Object { $_.GetAttribute('Key', 'http://schemas.microsoft.com/winfx/2006/xaml') -eq 'IconHeadset' }
$headset = [Windows.Media.Geometry]::Parse($headsetNode.InnerText)
$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$frames = @()
foreach ($size in $sizes) {
    $visual = New-Object Windows.Media.DrawingVisual
    $dc = $visual.RenderOpen()
    $dc.PushTransform((New-Object Windows.Media.ScaleTransform ($size / 32.0), ($size / 32.0)))
    $brand = [Windows.Media.BrushConverter]::new().ConvertFromString('#5a55d6')
    $dc.DrawRoundedRectangle($brand, $null, [Windows.Rect]::new(0, 0, 32, 32), 8, 8)
    $dc.PushTransform([Windows.Media.TranslateTransform]::new(4, 4))
    $pen = [Windows.Media.Pen]::new([Windows.Media.Brushes]::White, 1.7)
    $pen.StartLineCap = 'Round'; $pen.EndLineCap = 'Round'; $pen.LineJoin = 'Round'
    $dc.DrawGeometry($null, $pen, $headset)
    $dc.Pop(); $dc.Pop(); $dc.Close()
    $bitmap = [Windows.Media.Imaging.RenderTargetBitmap]::new($size, $size, 96, 96, [Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new()
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $stream = [IO.MemoryStream]::new()
    $encoder.Save($stream)
    $frames += ,$stream.ToArray()
    $stream.Dispose()
}
$output = Join-Path $appRoot 'Assets/kaster-agent.ico'
$file = [IO.File]::Create($output)
$writer = [IO.BinaryWriter]::new($file)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frames[$i].Length); $writer.Write([uint32]$offset)
        $offset += $frames[$i].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
} finally { $writer.Dispose(); $file.Dispose() }
Write-Output "Generated $output ($($sizes -join ', ') px)"
