$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'build'
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null
$iconImages = @()
foreach ($iconSize in @(16,24,32,48,64,128,256)) {
  $bitmap = [System.Drawing.Bitmap]::new($iconSize,$iconSize)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.ScaleTransform($iconSize/48.0,$iconSize/48.0)
  $blueBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#2867ff'))
  $graphics.FillEllipse($blueBrush,3,3,42,42)
  $wave = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $wave.AddBezier(4,30,13,18,19,13,26,18)
  $wave.AddBezier(26,18,30,21,33,22,43,17)
  $wave.AddLine(43,17,43,25)
  $wave.AddBezier(43,25,33,31,28,30,23,26)
  $wave.AddBezier(23,26,18,23,14,26,6,36)
  $wave.CloseFigure()
  $graphics.FillPath([System.Drawing.Brushes]::White,$wave)
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
  $iconImages += ,@{ Size=$iconSize; Data=$stream.ToArray() }
  if ($iconSize -eq 256) { $bitmap.Save((Join-Path $iconDirectory 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png) }
  $stream.Dispose(); $wave.Dispose(); $blueBrush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$outputStream = [System.IO.File]::Create((Join-Path $iconDirectory 'icon.ico'))
$writer = [System.IO.BinaryWriter]::new($outputStream)
try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$iconImages.Count)
  $iconOffset = 6 + 16 * $iconImages.Count
  foreach ($iconImage in $iconImages) {
    $iconDimension = if ($iconImage.Size -eq 256) { 0 } else { $iconImage.Size }
    $writer.Write([byte]$iconDimension); $writer.Write([byte]$iconDimension)
    $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$iconImage.Data.Length); $writer.Write([uint32]$iconOffset)
    $iconOffset += $iconImage.Data.Length
  }
  foreach ($iconImage in $iconImages) { $writer.Write([byte[]]$iconImage.Data) }
} finally { $writer.Dispose(); $outputStream.Dispose() }
Write-Output 'Created build/icon.ico and build/icon.png'
