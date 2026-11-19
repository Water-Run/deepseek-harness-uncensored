<# Production uninstaller checks with isolated application identity and seeded data. #>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Installer, [Parameter(Mandatory)][string]$ProductName,
    [Parameter(Mandatory)][string]$RegistryKey, [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][string]$Language, [Parameter(Mandatory)][string]$PackageName,
    [Parameter(Mandatory)][string]$Version,
    [switch]$SilentOnly)
$ErrorActionPreference = 'Stop'
$copy = (Get-Content (Join-Path $PSScriptRoot "../installer/locales/$Language.json") -Encoding UTF8 -Raw | ConvertFrom-Json).uninstaller
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (-not $SilentOnly) {
    . (Join-Path $PSScriptRoot 'windows-installer-ui.ps1')
    [InstallerCapture]::Initialize()
}
$expected = Get-Content (Join-Path $PSScriptRoot 'expected/windows-uninstall.json') -Raw | ConvertFrom-Json
$nsisNoticeName = 'nsis-installer-COPYING.txt'
$nsisNoticeSource = Join-Path (Join-Path $OutputDirectory '.nsis-directory-installer') $nsisNoticeName
$expectedNsisNotice = [Convert]::ToBase64String([IO.File]::ReadAllBytes($nsisNoticeSource))
$roaming = [Environment]::GetFolderPath('ApplicationData')
$local = [Environment]::GetFolderPath('LocalApplicationData')
$installPath = Join-Path $OutputDirectory 'Uninstall App'
$homePath = Join-Path $OutputDirectory 'Harness Home'
$externalPath = Join-Path $OutputDirectory 'External Project'
$productDataPath = Join-Path $roaming $ProductName
# Electron nests user data under the package scope; electron-builder strips the separator from the updater cache name.
$scopePath = Join-Path $roaming $PackageName.Split('/')[0]
$userDataPath = Join-Path $roaming ($PackageName -replace '/', '\')
$cachePath = Join-Path $local (($PackageName -replace '[/\\?<>:*|"]', '').ToLowerInvariant() + '-updater')
$partitionFile = Join-Path $productDataPath 'Partitions\isolated\Local Storage\leveldb\fixture'
$uninstaller = Join-Path $OutputDirectory 'uninstall-copy.exe'
$entryKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $RegistryKey
$appId = 'com.deepseek.harness.installertest.n' + $RegistryKey.Replace('-', '')
$shortcutPaths = @(
    (Join-Path ([Environment]::GetFolderPath('Programs')) "$ProductName.lnk")
    (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) "$ProductName.lnk")
)
$process = $null
$previousHome = [Environment]::GetEnvironmentVariable('DSH_UNCENSORED_HOME', 'Process')
$previousOfficialHome = [Environment]::GetEnvironmentVariable('DSH_HOME', 'Process')
$officialHomePath = Join-Path $OutputDirectory 'Official Home'
$aliasPath = Join-Path $OutputDirectory 'Home Alias'
function Wait-Text([string]$Text) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    do {
        $control = [InstallerCapture]::FindText($process.Id, $Text)
        if ($control -ne [IntPtr]::Zero) { return $control }
        if ($process.HasExited) { throw "Uninstaller exited: $($process.ExitCode)" }
        Start-Sleep -Milliseconds 25
    } while ($timer.Elapsed.TotalSeconds -lt 20)
    throw "Missing '$Text': $([InstallerCapture]::VisibleText($process.Id))"
}
function Wait-Exit {
    if (-not $process.WaitForExit(30000)) { $process.Kill(); $process.WaitForExit(); throw 'Uninstaller timed out' }
    if ($process.ExitCode -ne 0) { throw "Uninstall failed: $($process.ExitCode)" }
    $process.Dispose()
    $script:process = $null
    # The NSIS uninstaller hands its section to a temporary copy; the launched process exits before removal completes.
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ((Test-Path -LiteralPath $installPath) -or (Test-Path -LiteralPath $entryKey)) {
        if ($timer.Elapsed.TotalSeconds -gt 20) { throw 'Application directory or uninstall entry remained' }
        Start-Sleep -Milliseconds 100
    }
}
function Assert-ShortcutIdentity([string]$Location = $installPath) {
    $shell = New-Object -ComObject Shell.Application
    $app = Join-Path $Location ($ProductName + '.exe')
    try {
        foreach ($path in $shortcutPaths) {
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Shortcut is missing: $path" }
            $folder = $shell.NameSpace((Split-Path -Parent $path))
            if ($null -eq $folder) { throw "Cannot open shortcut directory: $path" }
            $item = $null
            try {
                $item = $folder.ParseName([IO.Path]::GetFileName($path))
                if ($null -eq $item -or $item.ExtendedProperty('System.AppUserModel.ID') -cne $appId) {
                    throw "Shortcut AppID differs: $path"
                }
                if ($item.ExtendedProperty('System.Link.TargetParsingPath') -ne $app) {
                    throw "Shortcut target differs: $path"
                }
            } finally {
                if ($null -ne $item) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item) }
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($folder)
            }
        }
    } finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
}
function Assert-SeededFile([string]$Path, [string]$Content, [bool]$Retained, [string]$Case) {
    if ((Test-Path -LiteralPath $Path -PathType Leaf) -ne $Retained) {
        throw "Unexpected file retention for $Case at $Path"
    }
    if ($Retained -and [IO.File]::ReadAllText($Path) -cne $Content) {
        throw "Retained file contents changed for $Case at $Path"
    }
}
function Invoke-SilentSetup([int]$ExpectedExitCode, [string]$Options = '', [string]$Destination = $installPath) {
    $setup = Start-Process -FilePath $Installer -ArgumentList ("/S $Options /D=" + $Destination) -PassThru -WindowStyle Hidden
    try {
        if (-not $setup.WaitForExit(30000)) { $setup.Kill(); $setup.WaitForExit(); throw 'Setup timed out' }
        if ($setup.ExitCode -ne $ExpectedExitCode) {
            throw "Setup returned $($setup.ExitCode), expected $ExpectedExitCode ($Options)"
        }
    } finally { $setup.Dispose() }
}

function Assert-VersionResource([string]$Path) {
    $resource = [Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
    $product = [version]::new($resource.ProductMajorPart, $resource.ProductMinorPart, $resource.ProductBuildPart, $resource.ProductPrivatePart)
    $file = [version]::new($resource.FileMajorPart, $resource.FileMinorPart, $resource.FileBuildPart, $resource.FilePrivatePart)
    if ($resource.ProductVersion -cne $Version -or $resource.FileVersion -cne $Version -or
        $product -ne [version]$Version -or $file -ne [version]$Version) {
        throw "Unexpected Windows version resource at ${Path}. Product/file: $($resource.ProductVersion) / $($resource.FileVersion). Fixed product/file: $product / $file. Expected $Version."
    }
}

function Assert-VersionGuard {
    $sentinel = Join-Path $installPath 'preserve-on-rejection.txt'
    [IO.File]::WriteAllText($sentinel, 'installed files')
    $cases = @(
        @{ Name = 'later day'; Installed = '2026.11.19.1'; Options = '' },
        @{ Name = 'later build in runtime format'; Installed = '2026.1118.10'; Options = '--updated /currentuser' },
        @{ Name = 'later build in display format'; Installed = '2026.11.18.10'; Options = '' },
        @{ Name = 'invalid version'; Installed = '2026.02.30.1'; Options = '' },
        @{ Name = 'missing version'; Installed = ''; Options = '' }
    )
    try {
        foreach ($case in $cases) {
            Set-ItemProperty -LiteralPath $entryKey -Name DisplayVersion -Value $case.Installed
            Invoke-SilentSetup 2 $case.Options
            if ((Get-ItemPropertyValue -LiteralPath $entryKey -Name DisplayVersion) -cne $case.Installed) {
                throw "A rejected setup changed the installed version: $($case.Name)"
            }
            Assert-SeededFile $sentinel 'installed files' $true $case.Name
            Assert-SeededFile (Join-Path $homePath 'session.txt') 'keep session' $true $case.Name
            Write-Output "passed: rejected $($case.Name)"
        }
        Set-ItemProperty -LiteralPath $entryKey -Name DisplayVersion -Value '0.1.0-test.20261111.8'
        Invoke-SilentSetup 0 '--updated /currentuser'

        $program = Join-Path $installPath ($ProductName + '.exe')
        $notice = Join-Path $installPath $nsisNoticeName
        foreach ($path in @($program, $notice)) {
            $item = Get-Item -LiteralPath $path -Force
            if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                [IO.Path]::GetDirectoryName($item.FullName) -cne $installPath) {
                throw "Invalid repair fixture file: $path"
            }
        }
        $expectedProgram = [Convert]::ToBase64String([IO.File]::ReadAllBytes($program))
        Remove-Item -LiteralPath $program
        [IO.File]::WriteAllText($notice, 'damaged fixture notice')
        try {
            Set-ItemProperty -LiteralPath $entryKey -Name DisplayVersion -Value ''
            Invoke-SilentSetup 2
            Set-ItemProperty -LiteralPath $entryKey -Name DisplayVersion -Value $Version
            Set-ItemProperty -LiteralPath $entryKey -Name InstallLocation -Value (Join-Path $OutputDirectory 'Other registration')
            Invoke-SilentSetup 2
            Assert-SeededFile $program '' $false 'rejected repair'
            Assert-SeededFile $notice 'damaged fixture notice' $true 'rejected repair'
        } finally {
            Set-ItemProperty -LiteralPath $entryKey -Name DisplayVersion -Value $Version
            Set-ItemProperty -LiteralPath $entryKey -Name InstallLocation -Value $installPath
        }
        Invoke-SilentSetup 0
        if ((Get-ItemPropertyValue -LiteralPath $entryKey -Name DisplayVersion) -cne $Version) {
            throw 'Accepted setup did not register the candidate version'
        }
        if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($program)) -cne $expectedProgram -or
            [Convert]::ToBase64String([IO.File]::ReadAllBytes($notice)) -cne $expectedNsisNotice) {
            throw 'Same-version repair did not restore the original payload'
        }
        Assert-SeededFile (Join-Path $homePath 'session.txt') 'keep session' $true 'same-version repair'
        Assert-SeededFile (Join-Path $officialHomePath 'session.txt') 'keep official session' $true 'same-version repair'
        Assert-SeededFile (Join-Path $productDataPath 'state.txt') 'product data' $true 'same-version repair'
        Assert-SeededFile (Join-Path $userDataPath 'Local State') 'chromium profile' $true 'same-version repair'
        Assert-SeededFile $partitionFile 'browser storage' $true 'same-version repair'
        Assert-SeededFile (Join-Path $cachePath 'download.txt') 'update' $true 'same-version repair'
        Assert-SeededFile (Join-Path $installPath 'launched.txt') '' $false 'same-version repair'
        Write-Output 'passed: same-version repair restored missing executable and damaged notice with data preserved'
    } finally {
        Set-ItemProperty -LiteralPath $entryKey -Name DisplayVersion -Value $Version
    }
}

function Assert-Relocation {
    $runtime = 'resources/app.asar'
    $original = [IO.File]::ReadAllText((Join-Path $installPath $runtime))
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class InstallerDirectoryLock {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern SafeFileHandle CreateFile(
        string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
}
'@
    $locked = Join-Path $OutputDirectory 'Locked installation'
    [void][IO.Directory]::CreateDirectory($locked)
    $handle = [InstallerDirectoryLock]::CreateFile($locked, 1, 3, [IntPtr]::Zero, 3, 0x02000000, [IntPtr]::Zero)
    try {
        if ($handle.IsInvalid) { throw "Could not lock the fixture destination: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
        Invoke-SilentSetup 2 -Destination $locked
    } finally {
        $handle.Dispose()
    }
    $reports = @(Get-ChildItem -LiteralPath (Join-Path $cachePath 'installer-logs') -File -Filter 'directory-failure-*.log')
    if ($reports.Count -ne 1) { throw 'The failed promotion did not write one directory report' }
    $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
    if (-not $report.Contains('Operation: RemoveDirectoryW') -or -not $report.Contains("Source: $locked")) {
        throw 'The failure report does not identify the blocked destination'
    }
    Assert-SeededFile (Join-Path $installPath $runtime) $original $true 'blocked relocation'
    if ((Get-ItemPropertyValue -LiteralPath $entryKey -Name InstallLocation) -ne $installPath) {
        throw 'Failed promotion changed the original registration'
    }
    Write-Output 'passed: failed promotion kept the original installation and registration'

    $nested = Join-Path $installPath 'Nested installation'
    Invoke-SilentSetup 2 -Destination $nested
    Assert-SeededFile (Join-Path $installPath $runtime) $original $true 'nested relocation'
    if (((Test-Path -LiteralPath $nested) -and @(Get-ChildItem -LiteralPath $nested -Force).Count -ne 0) -or
        (Get-ItemPropertyValue -LiteralPath $entryKey -Name InstallLocation) -ne $installPath) {
        throw 'Rejected relocation installed files or changed the original registration'
    }
    Write-Output 'passed: refused nested relocation and preserved the old payload'

    $destination = "$installPath moved"
    Invoke-SilentSetup 0 -Destination $destination
    Assert-SeededFile (Join-Path $destination $runtime) $original $true 'disjoint relocation'
    if ((Test-Path -LiteralPath $installPath) -or
        (Get-ItemPropertyValue -LiteralPath $entryKey -Name InstallLocation) -ne $destination) {
        throw 'Relocation did not retire the old installation and register the new destination'
    }
    Assert-ShortcutIdentity $destination
    Invoke-SilentSetup 0
    Assert-SeededFile (Join-Path $installPath $runtime) $original $true 'return relocation'
    Assert-SeededFile (Join-Path $homePath 'session.txt') 'keep session' $true 'disjoint relocation'
    Assert-SeededFile (Join-Path $officialHomePath 'session.txt') 'keep official session' $true 'disjoint relocation'
    if (Test-Path -LiteralPath $destination) { throw 'Return relocation left the other installation in place' }
    Assert-ShortcutIdentity
    Write-Output 'passed: relocated to a sibling directory and back with the same data and correct shortcuts'
}

try {
    Assert-VersionResource $Installer
    foreach ($mode in $expected.cases) {
        if ($SilentOnly -and $mode -eq 'interactive') { continue }
        Invoke-SilentSetup 0
        $entry = Get-ItemProperty -LiteralPath $entryKey
        if ($entry.InstallLocation.TrimEnd('\') -ne $installPath -or $entry.DisplayVersion -cne $Version) {
            throw 'Uninstall entry differs from the fixture location or version'
        }
        $shortcutIdentityError = $null
        if ($mode -eq 'silent') {
            try { Assert-ShortcutIdentity } catch { $shortcutIdentityError = $_ }
        }
        $installedNsisNoticePath = Join-Path $installPath $nsisNoticeName
        $installedNsisNotice = if ([IO.File]::Exists($installedNsisNoticePath)) {
            [Convert]::ToBase64String([IO.File]::ReadAllBytes($installedNsisNoticePath))
        }
        foreach ($path in @($homePath, $officialHomePath, $productDataPath, $userDataPath, $cachePath, $externalPath)) { New-Item -ItemType Directory -Force -Path $path | Out-Null }
        [IO.File]::WriteAllText((Join-Path $externalPath 'keep.txt'), 'outside data root')
        if (-not (Test-Path -LiteralPath (Join-Path $userDataPath 'linked-project'))) {
            New-Item -ItemType Junction -Path (Join-Path $userDataPath 'linked-project') -Target $externalPath | Out-Null
        }
        [IO.File]::WriteAllText((Join-Path $homePath 'session.txt'), 'keep session')
        [IO.File]::WriteAllText((Join-Path $officialHomePath 'session.txt'), 'keep official session')
        [IO.File]::WriteAllText((Join-Path $productDataPath 'state.txt'), 'product data')
        [IO.File]::WriteAllText((Join-Path $userDataPath 'Local State'), 'chromium profile')
        [IO.File]::WriteAllText((Join-Path $cachePath 'download.txt'), 'update')
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($partitionFile)) | Out-Null
        [IO.File]::WriteAllText($partitionFile, 'browser storage')
        if ($mode -eq 'silent') {
            $env:DSH_UNCENSORED_HOME = $homePath
            $env:DSH_HOME = $officialHomePath
            Assert-VersionGuard
            Assert-Relocation
        }
        Copy-Item -LiteralPath (Join-Path $installPath ('Uninstall ' + $ProductName + '.exe')) -Destination $uninstaller -Force
        Assert-VersionResource $uninstaller
        $uninstallCommand = $uninstaller
        $arguments = '_?=' + $installPath
        if ($mode -in @('silent', 'purge')) {
            $uninstallCommand = Join-Path $installPath ('Uninstall ' + $ProductName + '.exe')
            $arguments = '/S'
            if ($mode -eq 'purge') { $arguments += ' /DELETE_APP_DATA=1' }
        }
        if ($mode -in @('home-inside', 'home-alias', 'home-invalid', 'official-home-inside')) {
            $arguments = '/S /DELETE_APP_DATA=1 ' + $arguments
        }
        if ($mode -eq 'purge-lookalike') { $arguments = '/S /DELETE_APP_DATA=10 "/NOTE=/DELETE_APP_DATA=1" ' + $arguments }
        # electron-builder's installUtil.nsh runs an older uninstaller with exactly these flags when replacing it.
        if ($mode -eq 'upgrade') { $arguments = '/S --updated /currentuser /DELETE_APP_DATA=1 ' + $arguments }
        if ($mode -eq 'replaced') { $arguments = '/S /KEEP_APP_DATA /currentuser /DELETE_APP_DATA=1 ' + $arguments }
        $env:DSH_UNCENSORED_HOME = $homePath
        $env:DSH_HOME = $officialHomePath
        if ($mode -eq 'official-home-inside') { $env:DSH_HOME = Join-Path $userDataPath 'official-home' }
        if ($mode -eq 'home-inside') { $env:DSH_UNCENSORED_HOME = Join-Path $userDataPath 'home' }
        if ($mode -eq 'home-invalid') { $env:DSH_UNCENSORED_HOME = 'relative\home' }
        if ($mode -eq 'home-alias') {
            $targetHome = Join-Path $userDataPath 'home'
            New-Item -ItemType Directory -Path $targetHome -Force | Out-Null
            New-Item -ItemType Junction -Path $aliasPath -Target $targetHome | Out-Null
            $env:DSH_UNCENSORED_HOME = $aliasPath
        }
        $process = Start-Process -FilePath $uninstallCommand -ArgumentList $arguments -PassThru -WindowStyle ($(if ($mode -eq 'interactive') { 'Normal' } else { 'Hidden' }))
        if ($mode -eq 'interactive') {
            $welcomeText = $copy.welcome
            $welcome = Wait-Text $welcomeText
            $window = [InstallerCapture]::TopLevel($welcome)
            [void][InstallerCapture]::SaveNative($window, (Join-Path $OutputDirectory 'uninstall-welcome.png'), $false)
            [InstallerCapture]::Click([InstallerCapture]::GetDlgItem($window, 1))
            $finishedText = $copy.finished
            [void](Wait-Text $finishedText)
            [InstallerCapture]::Click([InstallerCapture]::GetDlgItem($window, 1))
        }
        Wait-Exit
        if ($null -ne $shortcutIdentityError) { throw $shortcutIdentityError }
        if ($mode -eq 'silent') {
            foreach ($path in $shortcutPaths) {
                if (Test-Path -LiteralPath $path) { throw "Shortcut remained after uninstall: $path" }
            }
            Write-Output 'passed: installed shortcut AppIDs and removal'
        }
        if ($installedNsisNotice -cne $expectedNsisNotice) { throw "Installed NSIS notice was missing or changed: $mode" }
        $retained = $mode -in @('interactive', 'silent', 'purge-lookalike', 'upgrade', 'replaced', 'home-alias', 'home-invalid')
        # An internal DSHU home protects its directory; unknown home mappings preserve all data candidates.
        $userDataRetained = $retained -or $mode -in @('home-inside', 'official-home-inside')
        if ([IO.File]::ReadAllText((Join-Path $externalPath 'keep.txt')) -ne 'outside data root') { throw 'Cleanup followed a junction into a project' }
        Assert-SeededFile (Join-Path $homePath 'session.txt') 'keep session' $true $mode
        Assert-SeededFile (Join-Path $officialHomePath 'session.txt') 'keep official session' $true $mode
        Assert-SeededFile (Join-Path $productDataPath 'state.txt') 'product data' $retained $mode
        Assert-SeededFile $partitionFile 'browser storage' $retained $mode
        Assert-SeededFile (Join-Path $userDataPath 'Local State') 'chromium profile' $userDataRetained $mode
        if ((Test-Path -LiteralPath $scopePath) -ne $userDataRetained) { throw "Package scope directory retention failed: $mode" }
        Assert-SeededFile (Join-Path $cachePath 'download.txt') 'update' $retained $mode
        Write-Output "passed: $mode"
    }
} finally {
    if ($null -eq $previousHome) { Remove-Item Env:DSH_UNCENSORED_HOME -ErrorAction SilentlyContinue }
    else { $env:DSH_UNCENSORED_HOME = $previousHome }
    if ($null -eq $previousOfficialHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue }
    else { $env:DSH_HOME = $previousOfficialHome }
    if ($process) { if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }; $process.Dispose() }
    if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($aliasPath)) -ne $OutputDirectory) { throw 'Unexpected home alias path' }
    if (Test-Path -LiteralPath $aliasPath) { Remove-Item -LiteralPath $aliasPath -Force }
    # Only unique test identities below known application-data parents are removed.
    foreach ($pair in @(@($productDataPath, $roaming), @($scopePath, $roaming), @($cachePath, $local))) {
        $target = [IO.Path]::GetFullPath($pair[0])
        if ([IO.Path]::GetDirectoryName($target) -ne $pair[1] -or -not ([IO.Path]::GetFileName($target).StartsWith('Harness Installer Test ') -or [IO.Path]::GetFileName($target).StartsWith('@harness-installer-test'))) { throw 'Unexpected fixture cleanup path' }
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    }
}
