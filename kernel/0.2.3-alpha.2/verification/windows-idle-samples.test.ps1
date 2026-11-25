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

$report = & (Join-Path $PSScriptRoot 'windows-idle-samples.ps1') -RootProcessId $PID -SampleCount 1 | ConvertFrom-Json
$sample = $report.samples[0]
$root = @($sample.processes | Where-Object pid -eq $PID)
if ($sample.establishedClients -ne 1 -or $sample.loopbackEstablishedConnections -ne 3 -or
    $sample.loopbackEstablishedEndpoints -ne 5 -or $root.Count -ne 1 -or $root[0].loopbackEstablishedEndpoints -ne 5) {
    throw "Unexpected loopback counts for a wildcard listener and a closed listener: $($sample | ConvertTo-Json -Depth 4)"
}
