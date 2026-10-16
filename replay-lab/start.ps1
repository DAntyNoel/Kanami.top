param(
    [string]$ReplayFile = '',
    [string]$OutputDirectory = '',
    [int]$Port = 8766,
    [switch]$Rebuild,
    [string]$ExportDirectory = '',
    [string]$BindAddress = '127.0.0.1'
)
$ErrorActionPreference = 'Stop'
$launchArgs = @('-X', 'utf8', (Join-Path $PSScriptRoot 'run.py'))
if ($ReplayFile) { $launchArgs += $ReplayFile }
if ($OutputDirectory) { $launchArgs += @('--out', $OutputDirectory) }
if ($Rebuild) { $launchArgs += '--rebuild' }
if ($ExportDirectory) { $launchArgs += @('--export', $ExportDirectory) }
$launchArgs += @('--port', "$Port", '--bind', $BindAddress)
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    & $python.Source @launchArgs
} else {
    & py -3 @launchArgs
}
exit $LASTEXITCODE
