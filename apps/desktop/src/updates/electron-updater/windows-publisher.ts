/** Check the installer's embedded Authenticode signature, timestamp and publisher. */
import { execFile } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

const inspectSignature = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1"
Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1"
$signature = Get-AuthenticodeSignature -LiteralPath $env:DSHU_UPDATE_SIGNATURE_FILE
$certificate = if ($signature.Status -eq 'Valid' -and $null -ne $signature.SignerCertificate) {
  [Convert]::ToBase64String($signature.SignerCertificate.RawData)
}
[pscustomobject]@{
  status = [string]$signature.Status
  signatureType = [string]$signature.SignatureType
  timestamped = $null -ne $signature.TimeStamperCertificate
  certificate = $certificate
} | ConvertTo-Json -Compress
`

/**
 * Inspect the installer as data with Windows PowerShell and compare the signer certificate.
 * @param publisherNames - Publisher identities provisioned by the installed application.
 * @param path - Installer path passed to PowerShell as data.
 * @returns Null for a valid embedded signature and timestamp from a configured publisher, otherwise a diagnostic.
 */
export async function verifyWindowsUpdatePublisher(publisherNames: readonly string[], path: string): Promise<string | null> {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (!systemRoot || !isAbsolute(systemRoot)) return 'Windows system directory is unavailable'
  const executable = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  try {
    const { stdout, stderr } = await promisify(execFile)(executable, ['-NoProfile', '-NonInteractive', '-InputFormat', 'None',
      '-EncodedCommand', Buffer.from(inspectSignature, 'utf16le').toString('base64')], {
      encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 64 * 1024,
      env: { ...process.env, PSModulePath: '', DSHU_UPDATE_SIGNATURE_FILE: path },
    })
    const result: unknown = JSON.parse(stdout)
    if (stderr || typeof result !== 'object' || result === null || !('status' in result)
      || !('signatureType' in result) || typeof result.signatureType !== 'string'
      || !('timestamped' in result) || typeof result.timestamped !== 'boolean') {
      return 'Invalid Windows signature inspection response'
    }
    if (result.status !== 'Valid' || !('certificate' in result) || typeof result.certificate !== 'string') {
      return 'Windows did not validate the installer signature'
    }
    if (result.signatureType !== 'Authenticode') return 'Installer must carry an embedded Authenticode signature'
    if (!result.timestamped) return 'Installer has no verified signing timestamp'
    const { subject } = new X509Certificate(Buffer.from(result.certificate, 'base64')).toLegacyObject()
    const identity = ['CN', 'O', 'C'].map((key) => {
      const value: unknown = subject[key]
      if (typeof value !== 'string' || value.trim() === '') throw new Error('Missing signer certificate attribute')
      const escaped = value.replace(/[\\",;+\x00-\x20]/gu, character => `\\${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
      return `${key}=${escaped}`
    }).join(',')
    return publisherNames.includes(identity) ? null : 'Installer signer does not match the configured publisher'
  } catch (_error) {
    return 'Windows signature inspection could not complete'
  }
}
