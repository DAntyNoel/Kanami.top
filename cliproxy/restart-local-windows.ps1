$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = $ScriptDir

Set-Location $ProjectDir

if (-not (Test-Path ".env")) {
    Write-Error "Missing .env. Copy .env.example and fill in the real values first."
    exit 1
}

$ComposeArgs = @("--env-file", ".env", "-f", "docker-compose.yml")
$RunningContainersRaw = docker compose @ComposeArgs ps -q
if ($LASTEXITCODE -ne 0) {
    throw "docker compose ps failed with exit code $LASTEXITCODE"
}

$RunningContainers = @($RunningContainersRaw | Where-Object { $_ -and $_.Trim() })

if ($RunningContainers.Count -gt 0) {
    Write-Host "Stopping running local Cloudflare Docker services..."
    docker compose @ComposeArgs stop
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose stop failed with exit code $LASTEXITCODE"
    }
} else {
    Write-Host "No running local Cloudflare Docker services found."
}

Write-Host "Starting local Cloudflare Docker services in detached mode..."
docker compose @ComposeArgs up -d --build --force-recreate
if ($LASTEXITCODE -ne 0) {
    throw "docker compose up failed with exit code $LASTEXITCODE"
}

docker compose @ComposeArgs ps
if ($LASTEXITCODE -ne 0) {
    throw "docker compose ps failed with exit code $LASTEXITCODE"
}
