# Draws the home-screen icons (icon-180.png, icon-512.png): a gold train line with
# four stops on the app's dark green. Run from anywhere (Windows PowerShell):
#   powershell -ExecutionPolicy Bypass -File "build/icons.ps1"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dir = Split-Path $PSScriptRoot -Parent

function Col($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

function Draw-Icon([int]$size, [string]$path) {
  $s = $size / 512.0
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  # background: the app's radial green glow (full bleed, so it also works as a maskable icon)
  $g.Clear((Col '#0c1813'))
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse([single](-150 * $s), [single](-230 * $s), [single](812 * $s), [single](760 * $s))
  $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush($glow)
  $pg.CenterColor = (Col '#1f5a42')
  $pg.SurroundColors = @((Col '#0c1813'))
  $pg.CenterPoint = New-Object System.Drawing.PointF([single](256 * $s), [single](150 * $s))
  $g.FillPath($pg, $glow)

  # the line: a metro-map zigzag, kept inside the maskable safe zone
  $pts = @(
    (New-Object System.Drawing.PointF([single](104 * $s), [single](336 * $s))),
    (New-Object System.Drawing.PointF([single](176 * $s), [single](336 * $s))),
    (New-Object System.Drawing.PointF([single](336 * $s), [single](176 * $s))),
    (New-Object System.Drawing.PointF([single](408 * $s), [single](176 * $s)))
  )
  $shadow = New-Object System.Drawing.Pen((Col '#07100c'), [single](58 * $s))
  $shadow.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $shadow.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $shadow.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.TranslateTransform(0, [single](10 * $s)); $g.DrawLines($shadow, $pts); $g.ResetTransform()
  $pen = New-Object System.Drawing.Pen((Col '#e8b84b'), [single](46 * $s))
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLines($pen, $pts)

  # stops: three passed (cream), and the next one ringed in gold
  $cream = New-Object System.Drawing.SolidBrush((Col '#fffdf7'))
  $ink = New-Object System.Drawing.Pen((Col '#1b2130'), [single](13 * $s))
  $stops = @(@(104, 336), @(216, 296), @(296, 216), @(408, 176))
  for ($i = 0; $i -lt $stops.Count; $i++) {
    $x = $stops[$i][0] * $s; $y = $stops[$i][1] * $s
    $r = $(if ($i -eq 3) { 44 } else { 33 }) * $s
    $g.FillEllipse($cream, [single]($x - $r), [single]($y - $r), [single](2 * $r), [single](2 * $r))
    $g.DrawEllipse($ink, [single]($x - $r), [single]($y - $r), [single](2 * $r), [single](2 * $r))
  }
  $gold = New-Object System.Drawing.SolidBrush((Col '#e8b84b'))
  $x = 408 * $s; $y = 176 * $s; $r = 17 * $s
  $g.FillEllipse($gold, [single]($x - $r), [single]($y - $r), [single](2 * $r), [single](2 * $r))

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("Wrote {0} ({1}x{1})" -f $path, $size)
}

Draw-Icon 512 (Join-Path $dir 'icon-512.png')
Draw-Icon 180 (Join-Path $dir 'icon-180.png')
