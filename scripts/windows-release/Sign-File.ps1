[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$SignTool,
    [Parameter(Mandatory)][ValidatePattern('^[A-Fa-f0-9]{40}$')][string]$CertificateThumbprint,
    [Parameter(Mandatory)][string]$ReportPath,
    [switch]$RequirePublisher,
    [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Authenticode signing and verification require Windows.' }
if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing signing target: $Path" }
$signature = Get-AuthenticodeSignature -LiteralPath $Path
$signedNow = $false
if ($signature.Status -eq 'NotSigned') {
    if ($VerifyOnly) { throw "Unsigned release file: $Path" }
    & $SignTool sign /sha1 $CertificateThumbprint /s My /fd sha256 /tr https://ts.ssl.com /td sha256 $Path | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Signing failed ($LASTEXITCODE): $Path" }
    $signedNow = $true
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
} elseif ($signature.Status -ne 'Valid') {
    # Do not hide an invalid upstream signature by overwriting it.
    throw "Invalid existing signature ($($signature.Status)): $Path"
}
if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate) { throw "Windows does not trust the signature: $Path" }
$ours = $signature.SignerCertificate.Thumbprint -eq $CertificateThumbprint
if (($RequirePublisher -or $signedNow) -and -not $ours) { throw "Unexpected publisher: $Path" }
if ($ours -and $null -eq $signature.TimeStamperCertificate) { throw "Missing trusted timestamp: $Path" }
$verifyArgs = @('verify', '/pa', '/all')
if ($ours) { $verifyArgs += '/tw' }
& $SignTool @verifyArgs $Path | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Signature verification failed ($LASTEXITCODE): $Path" }
[pscustomobject]@{
    file = [IO.Path]::GetFileName($Path)
    sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    signer = $signature.SignerCertificate.Thumbprint.ToUpperInvariant()
    publisher = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    timestamped = ($null -ne $signature.TimeStamperCertificate)
    verified = $true
} | ConvertTo-Json | Set-Content -LiteralPath $ReportPath -Encoding UTF8
