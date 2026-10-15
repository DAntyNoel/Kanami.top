param(
    [string]$ReplayFile = '',
    [string]$OutputDirectory = '',
    [int]$Port = 8766,
    [switch]$Rebuild
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ReplayFile) {
    $ReplayFile = Join-Path $repoRoot '_replay-inspection\20261015\1.18.3.7_751028091756896271_1791469576_3vhtlakx.replay'
}
$ReplayFile = (Resolve-Path -LiteralPath $ReplayFile).Path
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path (Split-Path -Parent $ReplayFile) 'decoded'
}
$playback = Join-Path $OutputDirectory 'playback.json'
$manifest = Join-Path $OutputDirectory 'manifest.json'
$needsBuild = $Rebuild -or -not (Test-Path -LiteralPath $playback) -or -not (Test-Path -LiteralPath $manifest)
if (-not $needsBuild) {
    $record = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
    $sourceHash = (Get-FileHash -LiteralPath $ReplayFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $needsBuild = $record.sha256 -ne $sourceHash
    foreach ($script in @('parse_replay.py', 'decode_replay.py', 'unreal_names.json')) {
        if ((Get-Item -LiteralPath (Join-Path $PSScriptRoot $script)).LastWriteTimeUtc -gt (Get-Item -LiteralPath $playback).LastWriteTimeUtc) { $needsBuild = $true }
    }
}
if ($needsBuild) {
    & python (Join-Path $PSScriptRoot 'parse_replay.py') $ReplayFile --out $OutputDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Replay parser failed.' }
    & python (Join-Path $PSScriptRoot 'decode_replay.py') $OutputDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Readable data conversion failed.' }
}
& python (Join-Path $PSScriptRoot 'serve.py') --data $playback --port $Port
if ($LASTEXITCODE -ne 0) { throw 'Replay viewer server failed.' }
