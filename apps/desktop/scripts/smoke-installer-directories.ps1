# Exercise the production NSIS directory transaction with private installation directories.
param(
  [Parameter(Mandatory)][string]$Makensis,
  [Parameter(Mandatory)][string]$SevenZip,
  [string]$FrameLibrary,
  [scriptblock]$SignExecutable
)
$ErrorActionPreference = 'Stop'
$Makensis = [System.IO.Path]::GetFullPath($Makensis)
$SevenZip = [System.IO.Path]::GetFullPath($SevenZip)
if ($FrameLibrary) {
  $FrameLibrary = [System.IO.Path]::GetFullPath($FrameLibrary)
  $installerStrings = Join-Path (Split-Path $FrameLibrary -Parent) 'strings.nsh'
  if (-not (Test-Path -LiteralPath $installerStrings -PathType Leaf)) {
    throw 'The prepared installer strings must be beside window-frame.dll'
  }
}
$scratch = [System.IO.Directory]::CreateTempSubdirectory('dsh-directory-smoke-').FullName
$fixture = Join-Path $PSScriptRoot '../tests/fixtures/installer-directory-smoke.nsi'

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
  & $Executable @Arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "$Executable exited with $LASTEXITCODE" }
}

try {
  $payload = Join-Path $scratch 'payload'
  New-Item -ItemType Directory -Path $payload | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $payload 'asset.txt'), 'new asset')
  [System.IO.File]::WriteAllText((Join-Path $payload 'new-only.txt'), 'new only')
  [IO.Directory]::CreateDirectory((Join-Path $payload 'resources')) | Out-Null
  [IO.File]::WriteAllText((Join-Path $payload 'resources/app.asar'), 'new runtime')
  $deepPayload = Join-Path $payload (('nested-' * 20) + '\asset-' + ('x' * 60) + '.txt')
  [IO.Directory]::CreateDirectory((Split-Path $deepPayload -Parent)) | Out-Null
  [IO.File]::WriteAllText($deepPayload, 'long path asset')
  $archive = Join-Path $scratch 'payload.7z'
  Invoke-Checked $SevenZip @('a', '-bd', '-t7z', $archive, "$payload/*")
  $brokenArchive = Join-Path $scratch 'broken.7z'
  [System.IO.File]::WriteAllText($brokenArchive, 'invalid archive')

  $incompletePayload = Join-Path $scratch 'incomplete-payload-source'
  [IO.Directory]::CreateDirectory((Join-Path $incompletePayload 'resources')) | Out-Null
  [IO.File]::WriteAllText((Join-Path $incompletePayload 'asset.txt'), 'new asset')
  $incompleteArchive = Join-Path $scratch 'incomplete.7z'
  Invoke-Checked $SevenZip @('a', '-bd', '-t7z', $incompleteArchive, "$incompletePayload/*")
  [IO.File]::WriteAllText((Join-Path $incompletePayload 'resources/app.asar'), '')
  $emptyArchive = Join-Path $scratch 'empty-asar.7z'
  Invoke-Checked $SevenZip @('a', '-bd', '-t7z', $emptyArchive, "$incompletePayload/*")

  $cases = @('occupied-late', 'missing-uninstaller', 'locked-promoted', 'abort-promoted', 'first', 'upgrade', 'transient-lock', 'locked', 'locked-stage',
      'missing-stage', 'restore-conflict', 'broken', 'incomplete-payload', 'empty-asar', 'cancelled')
  if ($FrameLibrary) { $cases += 'registration-failed' }
  foreach ($mode in $cases) {
    $caseRoot = Join-Path $scratch $mode
    $target = Join-Path $caseRoot 'Application'
    New-Item -ItemType Directory -Path $caseRoot | Out-Null
    if ($mode -notin @('first', 'occupied-late')) {
      New-Item -ItemType Directory -Path $target | Out-Null
      [System.IO.File]::WriteAllText((Join-Path $target 'asset.txt'), 'old asset')
      [System.IO.File]::WriteAllText((Join-Path $target 'obsolete.txt'), 'old only')
      [IO.Directory]::CreateDirectory((Join-Path $target 'resources')) | Out-Null
      [IO.File]::WriteAllText((Join-Path $target 'resources/app.asar'), 'old runtime')
      $oldDeep = Join-Path $target ([IO.Path]::GetRelativePath($payload, $deepPayload))
      [IO.Directory]::CreateDirectory((Split-Path $oldDeep -Parent)) | Out-Null
      [IO.File]::WriteAllText($oldDeep, 'old long path asset')
    }
    $probe = Join-Path $caseRoot 'probe.exe'
    $caseArchive = switch ($mode) {
      'broken' { $brokenArchive }
      'incomplete-payload' { $incompleteArchive }
      'empty-asar' { $emptyArchive }
      default { $archive }
    }
    $reportDir = Join-Path $caseRoot 'installer-logs'
    $compileArgs = @('/V2', "/DOUTPUT_FILE=$probe", "/DPAYLOAD_FILE=$caseArchive", "/DTARGET_DIR=$target", "/DDSH_SEVENZIP_PATH=$SevenZip")
    if ($FrameLibrary) { $compileArgs += @("/DSOURCE_DLL=$FrameLibrary", "/DREPORT_DIR=$reportDir", "/DINSTALLER_STRINGS_FILE=$installerStrings") }
    if ($mode -eq 'occupied-late') { $compileArgs += '/DOCCUPIED_LATE' }
    if ($mode -eq 'missing-uninstaller') { $compileArgs += '/DMISSING_UNINSTALLER' }
    if ($mode -eq 'missing-stage') { $compileArgs += '/DMISSING_STAGE' }
    if ($mode -eq 'locked-stage') { $compileArgs += '/DLOCKED_STAGE' }
    if ($mode -eq 'restore-conflict') { $compileArgs += '/DRESTORE_CONFLICT' }
    if ($mode -eq 'cancelled') { $compileArgs += '/DCANCELLED' }
    if ($mode -in @('abort-promoted', 'locked-promoted')) { $compileArgs += '/DABORT_PROMOTED' }
    if ($mode -eq 'locked-promoted') { $compileArgs += '/DLOCKED_PROMOTED' }
    if ($mode -eq 'registration-failed') {
      $registrationKey = 'Software\DSHU Installer Directory Smoke\' + [guid]::NewGuid().ToString('N')
      $compileArgs += @('/DREGISTRATION_FAILED', "/DREGISTRATION_TEST_KEY=$registrationKey")
    }
    Invoke-Checked $Makensis ($compileArgs + $fixture)
    if ($null -ne $SignExecutable) { & $SignExecutable $probe }
    $handle = $null
    $process = $null
    try {
      if ($mode -in @('locked', 'transient-lock')) {
        $handle = [System.IO.File]::Open((Join-Path $target 'asset.txt'), 'Open', 'Read', 'Read')
      }
      $process = Start-Process -FilePath $probe -ArgumentList '/S' -WindowStyle Hidden -PassThru
      if ($mode -eq 'transient-lock') {
        $deadline = [Diagnostics.Stopwatch]::StartNew()
        $observedFailure = $false
        while (-not $process.HasExited -and $deadline.Elapsed.TotalSeconds -lt 30) {
          $pluginPath = "$target.plugin-dir"
          if (Test-Path -LiteralPath $pluginPath) {
            $trace = Join-Path ([IO.File]::ReadAllText($pluginPath)) 'directory-operations.log'
            if (Test-Path -LiteralPath $trace) {
              $stream = [IO.File]::Open($trace, 'Open', 'Read', 'ReadWrite')
              $reader = [IO.StreamReader]::new($stream)
              try { $attempts = $reader.ReadToEnd() } finally { $reader.Dispose() }
              if ($attempts -match 'Windows error: (5|32|33)\b') {
                $observedFailure = $true
                break
              }
            }
          }
          Start-Sleep -Milliseconds 20
        }
        if (-not $observedFailure) { throw 'Transient-lock smoke did not observe the failed operation before release' }
        $handle.Dispose()
        $handle = $null
      }
      if (-not $process.WaitForExit(60000)) {
        $process.Kill($true)
        $process.WaitForExit()
        throw "Directory smoke $mode did not exit within 60 seconds"
      }
      $expectedExit = if ($mode -in @('first', 'upgrade', 'transient-lock')) { 0 } else { 2 }
      if ($process.ExitCode -ne $expectedExit) {
        throw "Directory smoke $mode exited with $($process.ExitCode), expected $expectedExit"
      }
    } finally {
      if ($null -ne $handle) { $handle.Dispose() }
      if ($null -ne $process) {
        if (-not $process.HasExited) { $process.Kill($true); $process.WaitForExit() }
        $process.Dispose()
      }
    }
    if ($mode -eq 'registration-failed') {
      $backups = @(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'Application.old-*')
      if ($backups.Count -ne 1 -or [IO.File]::ReadAllText((Join-Path $backups[0].FullName 'resources/app.asar')) -ne 'old runtime' -or
          [IO.File]::ReadAllText((Join-Path $target 'resources/app.asar')) -ne 'new runtime') {
        throw 'Failed registration did not preserve both payloads'
      }
      if (Test-Path -LiteralPath "HKCU:\$registrationKey") { throw 'Failed registration wrote a new entry' }
      $reports = @(Get-ChildItem -LiteralPath $reportDir -File -Filter 'registration-failure-*.log')
      if ($reports.Count -ne 1) { throw 'Failed registration did not save exactly one report' }
      $report = Get-Content -LiteralPath $reports[0].FullName -Raw
      if (-not $report.Contains('Incomplete installer registration: InstallLocation') -or
          -not $report.Contains("Preserved backup: $($backups[0].FullName)")) {
        throw 'Registration report does not identify the failing value and preserved backup'
      }
      Write-Output "Directory replacement smoke passed: $mode"
      continue
    }
    if ($mode -eq 'locked-promoted') {
      $backups = @(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'Application.old-*')
      $newOnly = Join-Path $target 'new-only.txt'
      if ($backups.Count -ne 1 -or [IO.File]::ReadAllText((Join-Path $backups[0].FullName 'obsolete.txt')) -ne 'old only' -or
          [IO.File]::ReadAllText((Join-Path $target 'asset.txt')) -ne 'new asset' -or
          -not (Test-Path -LiteralPath $newOnly) -or [IO.File]::ReadAllText($newOnly) -ne 'new only') {
        throw 'Blocked rollback did not preserve both the previous and promoted payloads'
      }
      if ($FrameLibrary) {
        $reports = @(Get-ChildItem -LiteralPath $reportDir -File)
        if ($reports.Count -ne 1) { throw 'Blocked rollback did not save exactly one report' }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
        if ($report -notmatch 'demote: Windows error: (5|32|33)\b' -or
            -not $report.Contains("Preserved backup: $($backups[0].FullName)")) {
          throw 'Blocked rollback report does not identify the failed move and the preserved backup'
        }
      }
      Write-Output "Directory replacement smoke passed: $mode"
      continue
    }
    if ($mode -eq 'restore-conflict') {
      $backups = @(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'Application.old-*')
      if ($backups.Count -ne 1 -or [IO.File]::ReadAllText((Join-Path $backups[0].FullName 'asset.txt')) -ne 'old asset' -or
          [IO.File]::ReadAllText((Join-Path $backups[0].FullName 'obsolete.txt')) -ne 'old only' -or
          [IO.File]::ReadAllText((Join-Path "$target.conflict" 'unrelated.txt')) -ne 'unrelated file') {
        throw 'Failed restoration did not preserve the backup and the conflicting destination'
      }
      if ((Test-Path -LiteralPath $target) -or @(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'Application.new-*').Count -ne 0) {
        throw 'Reported restoration failure retried recovery or retained its unlocked staging directory'
      }
      if ($FrameLibrary) {
        $reports = @(Get-ChildItem -LiteralPath $reportDir -File)
        if ($reports.Count -ne 1) { throw 'Failed restoration did not save exactly one report' }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
        foreach ($expected in @('promote: Windows error: 183', 'restore: Windows error: 183', 'Restoration error: 183', "Preserved backup: $($backups[0].FullName)")) {
          if (-not $report.Contains($expected)) { throw "Failed restoration report lacks '$expected'" }
        }
      }
      Write-Output "Directory replacement smoke passed: $mode"
      continue
    }
    if ($mode -eq 'occupied-late') {
      $surviving = @(Get-ChildItem -LiteralPath $target -Force)
      if ($surviving.Count -ne 1 -or $surviving[0].Name -ne 'unrelated.txt' -or
          [IO.File]::ReadAllText($surviving[0].FullName) -ne 'unrelated file') {
        throw 'The newly occupied directory did not retain its original file'
      }
      if (@(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'Application.*-*').Count -ne 0) {
        throw 'The rejected install left transaction directories behind'
      }
      if ($FrameLibrary) {
        $reports = @(Get-ChildItem -LiteralPath $reportDir -File -Filter 'directory-failure-*.log')
        if ($reports.Count -ne 1) { throw 'The rejected install did not save one directory report' }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
        if ($report -notmatch 'Operation: RemoveDirectoryW\r?\nWindows error: 145\b') {
          throw 'The directory report did not identify the occupied destination'
        }
      }
      Write-Output "Directory replacement smoke passed: $mode"
      continue
    }
    $expectedAsset = if ($mode -in @('first', 'upgrade', 'transient-lock')) { 'new asset' } else { 'old asset' }
    if ([System.IO.File]::ReadAllText((Join-Path $target 'asset.txt')) -ne $expectedAsset) {
      throw "Directory smoke $mode changed the wrong version"
    }
    $expectObsolete = $mode -notin @('first', 'upgrade', 'transient-lock')
    $expectedRuntime = if ($expectObsolete) { 'old runtime' } else { 'new runtime' }
    if ([IO.File]::ReadAllText((Join-Path $target 'resources/app.asar')) -ne $expectedRuntime) {
      throw "Directory smoke $mode changed the wrong runtime"
    }
    if ((Test-Path -LiteralPath (Join-Path $target 'obsolete.txt')) -ne $expectObsolete) {
      throw "Directory smoke $mode did not preserve the expected old-only file state"
    }
    if (@(Get-ChildItem -LiteralPath $caseRoot -Directory | Where-Object Name -notin @('Application', 'installer-logs')).Count -ne 0) {
      throw "Directory smoke $mode left transaction directories behind"
    }
    if ($FrameLibrary) {
      $reports = @(if (Test-Path -LiteralPath $reportDir) { Get-ChildItem -LiteralPath $reportDir -File })
      if ($mode -eq 'broken') {
        if ($reports.Count -ne 1 -or $reports[0].Name -notmatch '^extract-failure-20\d{6}-\d{6}\.log$') {
          throw "Directory smoke $mode did not save exactly one extraction report"
        }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
        foreach ($expected in @('Result: 7-Zip exit code 2 (fatal error)', "Archive: $caseArchive", 'Cannot open the file as [7z] archive')) {
          if (-not $report.Contains($expected)) { throw "Directory smoke $mode report lacks '$expected'" }
        }
      } elseif ($mode -in @('incomplete-payload', 'empty-asar', 'missing-uninstaller')) {
        if ($reports.Count -ne 1 -or $reports[0].Name -notlike 'payload-failure-*.log') {
          throw "Directory smoke $mode did not save exactly one payload failure report"
        }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw
        $expectedError = if ($mode -eq 'empty-asar') { '13' } else { '[23]' }
        $expectedFile = if ($mode -eq 'missing-uninstaller') { 'Uninstall Fixture.exe' } else { 'resources\app.asar' }
        if ($report -notmatch "Invalid staged application file \($expectedError\): .*\\$([regex]::Escape($expectedFile))") {
          throw "Directory smoke $mode did not report the invalid file $expectedFile"
        }
      } elseif ($mode -in @('locked', 'locked-stage', 'missing-stage')) {
        if ($reports.Count -ne 1 -or $reports[0].Name -notmatch '^directory-failure-20\d{6}-\d{6}\.log$') {
          throw "Directory smoke $mode expected one directory report, found $($reports.Count): $($reports.Name -join ', ')"
        }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
        $expectedError = if ($mode -ne 'missing-stage') { '(5|32|33)' } else { '2' }
        if ($report -notmatch "Windows error: $expectedError\b") { throw "Directory smoke $mode reported an unexpected Windows error" }
        foreach ($expected in @('Operation: MoveFileExW', 'Restoration error: 0')) {
          if (-not $report.Contains($expected)) { throw "Directory smoke $mode report lacks '$expected'" }
        }
        $attempts = ([regex]::Matches($report, 'Windows error: ')).Count - 1
        $expectedAttempts = if ($mode -ne 'missing-stage') { 10 } else { 1 }
        if ($attempts -ne $expectedAttempts) { throw "Directory smoke $mode recorded $attempts failed attempts, expected $expectedAttempts" }
      } elseif ($reports.Count -ne 0) {
        throw "Directory smoke $mode saved an unexpected extraction report"
      }
    }
    Write-Output "Directory replacement smoke passed: $mode"
  }
} finally {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $resolvedScratch = [System.IO.Path]::GetFullPath($scratch)
  if (-not $resolvedScratch.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing cleanup outside the temporary root: $resolvedScratch"
  }
  Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
}
