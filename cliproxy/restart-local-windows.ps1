$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = $ScriptDir

Set-Location $ProjectDir

if (-not (Test-Path ".env")) {
    Write-Error "Missing .env. Copy .env.example and fill in the real values first."
    exit 1
}

$ComposeArgs = @("--env-file", ".env", "-f", "docker-compose.yml")
$UsageKeeperComposeArgs = @("--env-file", ".env", "-f", "docker-compose.usage-keeper.yml")

function Get-DotEnvValue {
    param([Parameter(Mandatory = $true)][string]$Name)

    $Line = Get-Content ".env" |
        Where-Object {
            $_ -match "^\s*$([regex]::Escape($Name))\s*=" -and
            $_ -notmatch "^\s*#"
        } |
        Select-Object -Last 1

    if (-not $Line) {
        return ""
    }

    return ($Line -replace "^\s*$([regex]::Escape($Name))\s*=\s*", "").Trim().Trim('"').Trim("'")
}

function Test-Truthy {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }

    switch ($Value.Trim().ToLowerInvariant()) {
        "1" { return $true }
        "true" { return $true }
        "yes" { return $true }
        "y" { return $true }
        "on" { return $true }
        default { return $false }
    }
}

$CliProxyImage = "kanami-cliproxy:latest"
$CliProxyImageValue = Get-DotEnvValue "CLI_PROXY_IMAGE"
if ($CliProxyImageValue) {
    $CliProxyImage = $CliProxyImageValue
}

$StartUsageKeeper = $env:START_USAGE_KEEPER
if (-not $StartUsageKeeper) {
    $StartUsageKeeper = Get-DotEnvValue "START_USAGE_KEEPER"
}
if (-not $StartUsageKeeper) {
    $StartUsageKeeper = "true"
}

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
docker image inspect $CliProxyImage *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Found local Docker image: $CliProxyImage"
    Write-Host "Starting without rebuilding CLIProxyAPI..."
    $UpArgs = @("up", "-d", "--no-build", "--force-recreate")
} else {
    Write-Host "Missing local Docker image: $CliProxyImage"
    Write-Host "Building CLIProxyAPI before start..."
    $UpArgs = @("up", "-d", "--build", "--force-recreate")
}

docker compose @ComposeArgs @UpArgs
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

if (Test-Truthy $StartUsageKeeper) {
    Write-Host "Restarting CPA Usage Keeper in detached mode..."
    Write-Host "Command: docker compose --env-file .env -f docker-compose.usage-keeper.yml up -d --force-recreate"
    docker compose @UsageKeeperComposeArgs up -d --force-recreate
    if ($LASTEXITCODE -ne 0) {
        throw "usage keeper docker compose up failed with exit code $LASTEXITCODE"
    }

    docker compose @UsageKeeperComposeArgs ps
    if ($LASTEXITCODE -ne 0) {
        throw "usage keeper docker compose ps failed with exit code $LASTEXITCODE"
    }
} else {
    Write-Host "CPA Usage Keeper not started because START_USAGE_KEEPER is false. To start it manually, run:"
    Write-Host "  docker compose --env-file .env -f docker-compose.usage-keeper.yml up -d --force-recreate"
}
