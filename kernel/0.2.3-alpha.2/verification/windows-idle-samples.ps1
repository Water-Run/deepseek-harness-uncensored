# Collect passive startup samples for an already running DSHU desktop process.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateRange(1, 2147483647)][int]$RootProcessId,
    [ValidateRange(1, 120)][int]$SampleCount = 7,
    [ValidateRange(1, 300)][int]$IntervalSeconds = 15
)

$ErrorActionPreference = 'Stop'
$root = Get-Process -Id $RootProcessId
$started = $root.StartTime
$version = $root.MainModule.FileVersionInfo.ProductVersion
$timer = [Diagnostics.Stopwatch]::StartNew()
$samples = for ($index = 0; $index -lt $SampleCount; $index++) {
    $wait = $index * $IntervalSeconds * 1000 - $timer.ElapsedMilliseconds
    if ($wait -gt 0) { Start-Sleep -Milliseconds $wait }
    if ($root.HasExited) { throw "Desktop process $RootProcessId exited before sample $($index + 1)." }

    $live = @(Get-CimInstance Win32_Process)
    $family = [System.Collections.Generic.HashSet[int]]::new()
    [void]$family.Add($RootProcessId)
    do {
        $before = $family.Count
        foreach ($row in $live) {
            if ($row.CreationDate -ge $started -and $family.Contains($row.ParentProcessId)) {
                [void]$family.Add($row.ProcessId)
            }
        }
    } until ($family.Count -eq $before)
    $processes = @(foreach ($row in $live) {
        if (!$family.Contains($row.ProcessId)) { continue }
        $role = if ($row.ProcessId -eq $RootProcessId) { 'main' }
                elseif ($row.CommandLine -match '--type=([^\s]+)') { $Matches[1] }
                else { $row.Name }
        [pscustomobject]@{
            pid = $row.ProcessId
            parentPid = $row.ParentProcessId
            role = $role
            privateBytes = [long]$row.PrivatePageCount
            handles = $row.HandleCount
        }
    })
    $local = @(Get-NetTCPConnection | Where-Object {
        $family.Contains($_.OwningProcess) -and $_.LocalAddress -in '127.0.0.1', '::1'
    })
    $listeners = @($local | Where-Object State -eq Listen | Select-Object -ExpandProperty LocalPort -Unique)
    $clients = @($local | Where-Object {
        $_.State -eq 'Established' -and $_.RemoteAddress -in '127.0.0.1', '::1' -and $_.RemotePort -in $listeners
    })
    [pscustomobject]@{
        observedAtUtc = [datetime]::UtcNow.ToString('o')
        elapsedSeconds = [math]::Round($timer.Elapsed.TotalSeconds, 1)
        privateBytes = ($processes | Measure-Object privateBytes -Sum).Sum
        handles = ($processes | Measure-Object handles -Sum).Sum
        listenerPorts = $listeners
        establishedClients = $clients.Count
        processes = $processes
    }
}
[pscustomobject]@{
    rootPid = $RootProcessId
    productVersion = $version
    osVersion = [Environment]::OSVersion.VersionString
    samples = @($samples)
} | ConvertTo-Json -Depth 5
