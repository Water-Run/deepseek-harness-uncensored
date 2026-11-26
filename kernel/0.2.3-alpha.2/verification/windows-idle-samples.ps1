# Collect passive startup samples for an already running DSHU desktop process.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateRange(1, 2147483647)][int]$RootProcessId,
    [ValidateRange(1, 120)][int]$SampleCount = 7,
    [ValidateRange(1, 300)][int]$IntervalSeconds = 15,
    [string]$JournalPath
)

$ErrorActionPreference = 'Stop'
function Get-LoopbackAddress([string]$Address) {
    $ip = $null
    if (![Net.IPAddress]::TryParse($Address, [ref]$ip)) { return }
    if ($ip.IsIPv4MappedToIPv6) { $ip = $ip.MapToIPv4() }
    if ([Net.IPAddress]::IsLoopback($ip)) { return $ip.ToString() }
}

function Get-IdleSample {
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
            workingSetBytes = [long]$row.WorkingSetSize
            handles = $row.HandleCount
        }
    })
    $ownedSockets = @(Get-NetTCPConnection | Where-Object { $family.Contains($_.OwningProcess) })
    $listeners = @($ownedSockets | Where-Object {
        $_.State -eq 'Listen' -and ($_.LocalAddress -in '0.0.0.0', '::' -or (Get-LoopbackAddress $_.LocalAddress))
    } | Select-Object -ExpandProperty LocalPort -Unique)
    $connections = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $clients = 0
    $endpoints = 0
    $endpointCounts = @{}
    foreach ($socket in $ownedSockets) {
        if ($socket.State -ne 'Established') { continue }
        $local = Get-LoopbackAddress $socket.LocalAddress
        $peer = Get-LoopbackAddress $socket.RemoteAddress
        if (!$local -or !$peer) { continue }
        $source = "[$local]:$($socket.LocalPort)"
        $destination = "[$peer]:$($socket.RemotePort)"
        $key = if ([string]::CompareOrdinal($source, $destination) -le 0) { "$source $destination" } else { "$destination $source" }
        [void]$connections.Add($key)
        $endpoints++
        $endpointCounts[[int]$socket.OwningProcess]++
        if ($socket.RemotePort -in $listeners) { $clients++ }
    }
    foreach ($process in $processes) {
        $process | Add-Member -NotePropertyName loopbackEstablishedEndpoints -NotePropertyValue ([int]$endpointCounts[[int]$process.pid])
    }
    [pscustomobject]@{
        observedAtUtc = [datetime]::UtcNow.ToString('o')
        elapsedSeconds = [math]::Round($timer.Elapsed.TotalSeconds, 1)
        privateBytes = ($processes | Measure-Object privateBytes -Sum).Sum
        workingSetBytes = ($processes | Measure-Object workingSetBytes -Sum).Sum
        handles = ($processes | Measure-Object handles -Sum).Sum
        listenerPorts = $listeners
        establishedClients = $clients
        loopbackEstablishedConnections = $connections.Count
        loopbackEstablishedEndpoints = $endpoints
        processes = $processes
    }
}

function Write-JournalRecord($Record) {
    if ($journal) { $journal.WriteLine(($Record | ConvertTo-Json -Depth 6 -Compress)) }
}

$root = Get-Process -Id $RootProcessId
$journal = $null
$file = $null
try {
    $started = $root.StartTime
    $version = $root.MainModule.FileVersionInfo.ProductVersion
    $os = [Environment]::OSVersion.VersionString
    if ($PSBoundParameters.ContainsKey('JournalPath')) {
        $path = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($JournalPath)
        $file = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
        $journal = [IO.StreamWriter]::new($file, [Text.UTF8Encoding]::new($false))
        $journal.AutoFlush = $true
        Write-JournalRecord @{ type = 'start'; observedAtUtc = [datetime]::UtcNow.ToString('o'); rootPid = $RootProcessId; productVersion = $version; osVersion = $os }
    }

    $reason = 'collector-error'
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        $samples = for ($index = 0; $index -lt $SampleCount; $index++) {
            $wait = $index * $IntervalSeconds * 1000 - $timer.ElapsedMilliseconds
            if ($wait -gt 0) { Start-Sleep -Milliseconds $wait }
            if ($root.HasExited) { throw "Desktop process $RootProcessId exited before sample $($index + 1)." }
            $sample = Get-IdleSample
            if ($root.HasExited) { throw "Desktop process $RootProcessId exited during sample $($index + 1)." }
            Write-JournalRecord @{ type = 'sample'; sample = $sample }
            $sample
        }
        $reason = 'completed'
    } catch {
        if ($root.HasExited) { $reason = 'process-exited' }
        throw
    } finally {
        Write-JournalRecord @{ type = 'end'; observedAtUtc = [datetime]::UtcNow.ToString('o'); reason = $reason }
    }
    [pscustomobject]@{ rootPid = $RootProcessId; productVersion = $version; osVersion = $os; samples = @($samples) } | ConvertTo-Json -Depth 5
} finally {
    if ($journal) { $journal.Dispose() }
    if ($file) { $file.Dispose() }
    $root.Dispose()
}
