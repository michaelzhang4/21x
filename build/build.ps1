# Assembles "index.html" by inlining the 21X card list and the
# cards.js / lib.js / app.js scripts into template.html. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File "build/build.ps1"
$ErrorActionPreference = 'Stop'
$bd  = $PSScriptRoot
$dir = Split-Path $bd -Parent
function Get-Text($p) { [System.IO.File]::ReadAllText($p) }

$html = Get-Text (Join-Path $bd 'template.html')
$pairs = [ordered]@{
  '__CARDS_JS__'  = (Get-Text (Join-Path $bd 'cards.js'))
  '__LIB_JS__'    = (Get-Text (Join-Path $bd 'lib.js'))
  '__APP_JS__'    = (Get-Text (Join-Path $bd 'app.js'))
  '__CARDS_CSV__' = (Get-Text (Join-Path (Join-Path $dir 'data') 'cards.csv'))
}
foreach ($k in $pairs.Keys) { $html = $html.Replace($k, [string]$pairs[$k]) }

$left = ([regex]::Matches($html, '__(?:CARDS_JS|LIB_JS|APP_JS|CARDS_CSV)__')).Count
if ($left -ne 0) { throw "Build failed: $left unreplaced placeholder(s) remain." }

$out = Join-Path $dir 'index.html'
[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("Built '{0}' ({1:N0} bytes)." -f $out, (Get-Item $out).Length)
