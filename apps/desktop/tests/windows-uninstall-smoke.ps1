<# Production uninstaller checks with isolated application identity and seeded data. #>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Installer, [Parameter(Mandatory)][string]$ProductName,
    [Parameter(Mandatory)][string]$RegistryKey, [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][string]$Language, [Parameter(Mandatory)][string]$PackageName,
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
function Assert-ShortcutIdentity {
    $shell = New-Object -ComObject Shell.Application
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
try {
    foreach ($mode in $expected.cases) {
        if ($SilentOnly -and $mode -eq 'interactive') { continue }
        $setup = Start-Process -FilePath $Installer -ArgumentList ('/S /D=' + $installPath) -PassThru -WindowStyle Hidden
        try {
            if (-not $setup.WaitForExit(30000)) { $setup.Kill(); $setup.WaitForExit(); throw 'Setup timed out' }
            if ($setup.ExitCode -ne 0) { throw "Setup failed: $($setup.ExitCode)" }
        } finally { $setup.Dispose() }
        $entry = Get-ItemProperty -LiteralPath $entryKey
        if ($entry.InstallLocation.TrimEnd('\') -ne $installPath) { throw 'Uninstall entry lacks InstallLocation' }
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
        Copy-Item -LiteralPath (Join-Path $installPath ('Uninstall ' + $ProductName + '.exe')) -Destination $uninstaller -Force
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
