# Collect passive startup samples for an already running DSHU desktop process.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateRange(1, 2147483647)][int]$RootProcessId,
    [ValidateRange(1, 120)][int]$SampleCount = 7,
    [ValidateRange(1, 300)][int]$IntervalSeconds = 15
)

$ErrorActionPreference = 'Stop'
function Test-LoopbackAddress([string]$Address) {
    $ip = $null
    if (![Net.IPAddress]::TryParse($Address, [ref]$ip)) { return $false }
    if ($ip.IsIPv4MappedToIPv6) { $ip = $ip.MapToIPv4() }
    return [Net.IPAddress]::IsLoopback($ip)
}

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
    $ownedSockets = @(Get-NetTCPConnection | Where-Object { $family.Contains($_.OwningProcess) })
    $listeners = @($ownedSockets | Where-Object {
        $_.State -eq 'Listen' -and ($_.LocalAddress -in '0.0.0.0', '::' -or (Test-LoopbackAddress $_.LocalAddress))
    } | Select-Object -ExpandProperty LocalPort -Unique)
    $endpoints = @($ownedSockets | Where-Object {
        $_.State -eq 'Established' -and (Test-LoopbackAddress $_.LocalAddress) -and (Test-LoopbackAddress $_.RemoteAddress)
    })
    $clients = @($endpoints | Where-Object { $_.RemotePort -in $listeners })
    $endpointCounts = @{}
    foreach ($endpoint in $endpoints) {
        $endpointCounts[[int]$endpoint.OwningProcess]++
    }
    foreach ($process in $processes) {
        $process | Add-Member -NotePropertyName loopbackEstablishedEndpoints -NotePropertyValue ([int]$endpointCounts[[int]$process.pid])
    }
    [pscustomobject]@{
        observedAtUtc = [datetime]::UtcNow.ToString('o')
        elapsedSeconds = [math]::Round($timer.Elapsed.TotalSeconds, 1)
        privateBytes = ($processes | Measure-Object privateBytes -Sum).Sum
        handles = ($processes | Measure-Object handles -Sum).Sum
        listenerPorts = $listeners
        establishedClients = $clients.Count
        loopbackEstablishedEndpoints = $endpoints.Count
        processes = $processes
    }
}
[pscustomobject]@{
    rootPid = $RootProcessId
    productVersion = $version
    osVersion = [Environment]::OSVersion.VersionString
    samples = @($samples)
} | ConvertTo-Json -Depth 5
