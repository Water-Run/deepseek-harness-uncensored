<# Check a released Windows installation against a candidate in a fresh Windows Sandbox account. #>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PreviousInstaller,
    [Parameter(Mandatory)][string]$PreviousVersion,
    [Parameter(Mandatory)][string]$CandidateInstaller,
    [Parameter(Mandatory)][string]$CandidateVersion,
    [string]$ComposerSample = (Join-Path $PSScriptRoot '../../../packages/sdk/client/tests/expected/input-prediction-projection.json')
)
$ErrorActionPreference = 'Stop'
$entry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\4bbab420-ba6b-5135-af15-70ac616e0cb2'
$report = Join-Path $env:LOCALAPPDATA 'deepseek-harness-uncensored-updater\installer-logs\version-check.log'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or (Test-Path -LiteralPath $entry)) {
    throw 'Use a fresh Windows Sandbox. These checks install DSHU and change its test registration.'
}
$composerProbe = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'installed-composer-session.mjs')).Path
$composerSamplePath = (Resolve-Path -LiteralPath $ComposerSample).Path
$composerData = Join-Path $env:TEMP ('dshu-composer-' + [guid]::NewGuid())

function Invoke-Composer($Installation, [string]$Phase, [string]$Compression) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $Installation.Location 'DeepSeek Harness Uncensored.exe'
    $start.Arguments = '--expose-internals "{0}" {1} "{2}" "{3}" {4}' -f $composerProbe, $Phase, ($composerData + '-' + $Compression), $composerSamplePath, $Compression
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $probe = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $probe.StandardOutput.ReadToEndAsync()
        $stderr = $probe.StandardError.ReadToEndAsync()
        if (-not $probe.WaitForExit(60000)) {
            $probe.Kill()
            throw "Installed composer Session check timed out during $Phase ($Compression)"
        }
        if ($probe.ExitCode -ne 0 -or $stdout.Result.Trim() -cne "composer-upgrade $Phase") {
            throw "Installed composer Session check failed during $Phase ($Compression, exit $($probe.ExitCode)). $($stderr.Result) $($stdout.Result)"
        }
    } finally { $probe.Dispose() }
}

function Invoke-Setup([string]$File, [string]$Options, [int]$Expected) {
    $process = Start-Process -FilePath $File -ArgumentList $Options -WindowStyle Hidden -PassThru
    try {
        if (-not $process.WaitForExit(300000)) { throw "Setup timed out: $File $Options" }
        if ($process.ExitCode -ne $Expected) { throw "Setup exited $($process.ExitCode), expected ${Expected}: $File $Options" }
    } finally {
        $process.Dispose()
    }
}

function Get-Installation {
    $item = Get-ItemProperty -LiteralPath $entry
    $exe = Get-Item -LiteralPath (Join-Path $item.InstallLocation 'DeepSeek Harness Uncensored.exe')
    [pscustomobject]@{
        Location = $item.InstallLocation
        Version = $item.DisplayVersion
        ExecutableVersion = $exe.VersionInfo.ProductVersion
        ExecutableHash = (Get-FileHash -LiteralPath $exe.FullName).Hash
        AsarHash = (Get-FileHash -LiteralPath (Join-Path $item.InstallLocation 'resources\app.asar')).Hash
    }
}

function Assert-Preserved($Expected, [string]$RegisteredVersion) {
    $actual = Get-Installation
    if ($actual.Location -ne $Expected.Location -or $actual.Version -cne $RegisteredVersion -or
        $actual.ExecutableVersion -cne $Expected.ExecutableVersion -or $actual.ExecutableHash -ne $Expected.ExecutableHash -or
        $actual.AsarHash -ne $Expected.AsarHash) { throw "Installation changed while checking $RegisteredVersion" }
}

Invoke-Setup $PreviousInstaller '/S' 0
$previous = Get-Installation
if ($previous.Version -cne $PreviousVersion -or $previous.ExecutableVersion -cne $PreviousVersion) {
    throw "Previous installation differs from $PreviousVersion"
}
$compressions = @('none', 'zstd')
foreach ($compression in $compressions) { Invoke-Composer $previous 'write' $compression }
Invoke-Setup $CandidateInstaller '--updated /S' 0
$candidate = Get-Installation
if ($candidate.Version -cne $CandidateVersion -or $candidate.ExecutableVersion -cne $CandidateVersion -or
    $candidate.Location -ne $previous.Location -or $candidate.AsarHash -eq $previous.AsarHash) {
    throw "Expected $CandidateVersion in the original installation with the new app.asar"
}
foreach ($compression in $compressions) { Invoke-Composer $candidate 'continue' $compression }

foreach ($case in @(
    @{Version = '9999.12.31.65535'; Reason = 'downgrade'},
    @{Version = '2026.11.23.00'; Reason = 'invalid-version'}
)) {
    Set-ItemProperty -LiteralPath $entry -Name DisplayVersion -Value $case.Version
    Invoke-Setup $CandidateInstaller '--updated /S' 2
    Assert-Preserved $candidate $case.Version
    $lines = [IO.File]::ReadAllLines($report)
    if ($lines -cnotcontains "reason=$($case.Reason)" -or $lines -cnotcontains "candidate=$CandidateVersion") {
        throw "Missing $($case.Reason) diagnostic for $CandidateVersion"
    }
}
Set-ItemProperty -LiteralPath $entry -Name DisplayVersion -Value $CandidateVersion
Invoke-Setup $CandidateInstaller '--updated /S' 0
Assert-Preserved $candidate $CandidateVersion
foreach ($compression in $compressions) { Invoke-Composer $candidate 'reopen' $compression }

[ordered]@{
    PreviousInstallerHash = (Get-FileHash -LiteralPath $PreviousInstaller).Hash
    CandidateInstallerHash = (Get-FileHash -LiteralPath $CandidateInstaller).Hash
    Previous = $previous
    Candidate = $candidate
    UpgradeExit = 0
    DowngradeExit = 2
    InvalidVersionExit = 2
    SameVersionExit = 0
    Composer = @('write', 'continue', 'reopen')
    ComposerCompression = $compressions
} | ConvertTo-Json -Depth 3
