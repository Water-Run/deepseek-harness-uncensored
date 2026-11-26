# Exercise the collector with both directions of a connection and an independent process.
$ErrorActionPreference = 'Stop'
function New-SocketRow($State, $Address, $Port, $PeerAddress, $PeerPort, $Owner) {
    [pscustomobject]@{ State = $State; LocalAddress = $Address; LocalPort = $Port; RemoteAddress = $PeerAddress; RemotePort = $PeerPort; OwningProcess = $Owner }
}
function Get-NetTCPConnection {
    New-SocketRow Listen '::' 4100 '' 0 $PID
    New-SocketRow Established '::ffff:127.0.0.1' 50501 '::ffff:127.0.0.1' 4100 $PID
    New-SocketRow Established '127.0.0.1' 4100 '127.0.0.1' 50501 $PID
    # Established endpoints outlive their listener.
    New-SocketRow Established '127.0.0.2' 50502 '127.0.0.1' 4200 $PID
    New-SocketRow Established '127.0.0.1' 4200 '127.0.0.2' 50502 $PID
    New-SocketRow Established '127.0.0.1' 50503 '127.0.0.1' 4100 0
    # Only the application end of this IPv6 connection is in the process tree.
    New-SocketRow Established '::1' 4201 '::1' 50505 $PID
    New-SocketRow Established '::1' 50505 '::1' 4201 0
    New-SocketRow Established '192.0.2.1' 50504 '192.0.2.2' 443 $PID
}

$collector = Join-Path $PSScriptRoot 'windows-idle-samples.ps1'
$report = & $collector -RootProcessId $PID -SampleCount 1 | ConvertFrom-Json
$sample = $report.samples[0]
$root = @($sample.processes | Where-Object pid -eq $PID)
if ($sample.establishedClients -ne 1 -or $sample.loopbackEstablishedConnections -ne 3 -or
    $sample.loopbackEstablishedEndpoints -ne 5 -or $root.Count -ne 1 -or $root[0].loopbackEstablishedEndpoints -ne 5) {
    throw "Unexpected loopback counts for a wildcard listener and a closed listener: $($sample | ConvertTo-Json -Depth 4)"
}
if ($root[0].workingSetBytes -le 0 -or $sample.workingSetBytes -lt $root[0].workingSetBytes) {
    throw 'Missing working set for the root process'
}

$trace = Join-Path ([IO.Path]::GetTempPath()) ('dshu-idle-' + [guid]::NewGuid() + '.jsonl')
$exitTrace = [IO.Path]::ChangeExtension($trace, 'exit.jsonl')
$child = $null
try {
    $report = & $collector -RootProcessId $PID -SampleCount 1 -JournalPath $trace | ConvertFrom-Json
    $records = @(Get-Content -LiteralPath $trace | ForEach-Object { $_ | ConvertFrom-Json })
    if (($records.type -join ',') -ne 'start,sample,end' -or $records[0].rootPid -ne $PID -or
        $records[1].sample.observedAtUtc -ne $report.samples[0].observedAtUtc -or $records[2].reason -ne 'completed') {
        throw 'Journal and final report disagree'
    }
    $hash = (Get-FileHash -LiteralPath $trace).Hash
    try {
        & $collector -RootProcessId $PID -SampleCount 1 -JournalPath $trace | Out-Null
        throw 'Collector opened an existing journal'
    } catch [IO.IOException] {
        if ((Get-FileHash -LiteralPath $trace).Hash -ne $hash) { throw 'Collector overwrote an existing journal' }
    }

    $child = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList '-NoProfile -NonInteractive -Command "Start-Sleep -Seconds 600"' -WindowStyle Hidden -PassThru
    function Start-Sleep([int]$Milliseconds) {
        $partial = @(Get-Content -LiteralPath $exitTrace | ForEach-Object { $_ | ConvertFrom-Json })
        $main = @($partial[1].sample.processes | Where-Object role -eq 'main')
        if (($partial.type -join ',') -ne 'start,sample' -or $main.Count -ne 1 -or $main[0].pid -ne $child.Id) {
            throw 'First sample was unavailable while the collector was running'
        }
        $child.Kill()
        $child.WaitForExit()
    }
    try {
        & $collector -RootProcessId $child.Id -SampleCount 2 -IntervalSeconds 300 -JournalPath $exitTrace | Out-Null
        throw 'Collector reported a completed run after process exit'
    } catch {
        if ($_.Exception.Message -ne "Desktop process $($child.Id) exited before sample 2.") { throw }
    }
    $records = @(Get-Content -LiteralPath $exitTrace | ForEach-Object { $_ | ConvertFrom-Json })
    if (($records.type -join ',') -ne 'start,sample,end' -or $records[2].reason -ne 'process-exited') {
        throw 'Journal lost the last complete sample or the process exit'
    }
} finally {
    if ($child) {
        if (!$child.HasExited) { $child.Kill(); $child.WaitForExit() }
        $child.Dispose()
    }
    foreach ($path in $trace, $exitTrace) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
    }
}
