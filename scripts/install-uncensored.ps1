<#
.SYNOPSIS
    Install this checkout's build as the `dsh-uncensored` command.

.DESCRIPTION
    Creates a launcher in the per-user programs directory, adds that directory to
    the user PATH when it is missing, and seeds the harness home with the mode
    skill packs. The official DeepSeek Harness keeps its own home, port, and
    command, so both installations run side by side.

    Run `pnpm run build:artifacts` first: the launcher runs the built CLI, not
    the TypeScript sources.
#>
[CmdletBinding()]
param(
    # Checkout to install from; defaults to the repository this script lives in.
    [string] $RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
    # Harness home to seed; defaults to this build's own home directory.
    [string] $HarnessHome = (Join-Path $env:USERPROFILE '.dsh-uncensored'),
    # Optional directory of skill packs to copy into "$HarnessHome/skills".
    [string] $SkillSource = 'D:\Coding\dsh-purge\skills'
)

$ErrorActionPreference = 'Stop'

$entry = Join-Path $RepositoryRoot 'apps\cli\lib\bin.js'
if (-not (Test-Path -LiteralPath $entry)) {
    throw "Built CLI missing at $entry. Run 'pnpm run build:artifacts' in $RepositoryRoot first."
}

$installDir = Join-Path $env:LOCALAPPDATA 'Programs\dsh-uncensored'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$launcher = Join-Path $installDir 'dsh-uncensored.cmd'
$body = @"
@echo off
rem This build keeps its own home even when the official install exports DSH_HOME.
if not defined DSH_UNCENSORED_HOME set "DSH_UNCENSORED_HOME=%USERPROFILE%\.dsh-uncensored"
set "DSH_HOME=%DSH_UNCENSORED_HOME%"
node "$entry" %*
"@
Set-Content -LiteralPath $launcher -Value $body -Encoding ASCII
Write-Host "launcher  $launcher"

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = @($userPath -split ';' | Where-Object { $_ -ne '' })
if ($entries -notcontains $installDir) {
    $updated = (@($entries) + $installDir) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
    Write-Host "path      added $installDir to the user PATH (new shells only)"
} else {
    Write-Host "path      $installDir already on the user PATH"
}

New-Item -ItemType Directory -Force -Path $HarnessHome | Out-Null
if (Test-Path -LiteralPath $SkillSource) {
    $target = Join-Path $HarnessHome 'skills'
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -Path (Join-Path $SkillSource '*') -Destination $target -Recurse -Force
    Write-Host "skills    seeded from $SkillSource"
} else {
    Write-Host "skills    skipped (no pack at $SkillSource)"
}

Write-Host ''
Write-Host "home      $HarnessHome"
Write-Host 'next      dsh-uncensored web --port 3099'
