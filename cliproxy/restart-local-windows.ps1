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
    Write-Host ""
    Write-Host "Docker build/start failed. If the error mentions docker.io, failed to fetch"
    Write-Host "anonymous token, or i/o timeout, Docker Hub is not reachable from this machine."
    Write-Host "Set these optional values in cliproxy/.env and retry:"
    Write-Host ""
    Write-Host "GO_BUILDER_IMAGE=docker.1ms.run/library/golang:1.26-alpine"
    Write-Host "RUNTIME_IMAGE=docker.1ms.run/library/alpine:3.23"
    Write-Host "CLOUDFLARED_IMAGE=docker.1ms.run/cloudflare/cloudflared:latest"
    Write-Host "GOPROXY=https://goproxy.cn,direct"
    Write-Host ""
    throw "docker compose up failed with exit code $LASTEXITCODE"
}

docker compose @ComposeArgs ps
if ($LASTEXITCODE -ne 0) {
    throw "docker compose ps failed with exit code $LASTEXITCODE"
}
