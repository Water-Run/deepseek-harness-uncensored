# Verify the existing installer without accessing the hardware token.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Installer,
    [Parameter(Mandatory)][string]$Thumbprint,
    [ValidatePattern('\A[0-9a-fA-F]{64}\z')][string]$ExpectedSha256
)
$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $Installer
if ($file -isnot [IO.FileInfo]) {
    throw 'Installer must be a file.'
}

# Deny writes and renames while Authenticode and the digest read this path.
$stream = [IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate) {
        throw 'Installer does not have a valid Authenticode signature.'
    }
    if ($signature.SignatureType -ne 'Authenticode') {
        throw 'Installer must carry an embedded Authenticode signature.'
    }
    if ($signature.SignerCertificate.Thumbprint -ne $Thumbprint) {
        throw 'Installer signer does not match the configured release certificate.'
    }
    if ($null -eq $signature.TimeStamperCertificate) {
        throw 'Installer has no verified signing timestamp.'
    }
    if ($PSBoundParameters.ContainsKey('ExpectedSha256')) {
        $sha256 = (Get-FileHash -Algorithm SHA256 -InputStream $stream).Hash.ToLowerInvariant()
        if ($sha256 -ne $ExpectedSha256) {
            throw 'Installer SHA-256 differs from the expected candidate digest.'
        }
        $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($file.FullName)
        [pscustomobject]@{
            File = $file.Name
            Size = $stream.Length
            ProductVersion = $version.ProductVersion
            FileVersion = $version.FileVersion
            Signature = 'Valid'
            Publisher = $signature.SignerCertificate.Subject
            Thumbprint = $signature.SignerCertificate.Thumbprint
            TimestampAuthority = $signature.TimeStamperCertificate.Subject
            SHA256 = $sha256
        }
    }
} finally {
    $stream.Dispose()
}
