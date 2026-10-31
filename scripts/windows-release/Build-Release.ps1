[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^v[0-9]+\.[0-9]+\.[0-9]+$')][string]$Tag,
    [Parameter(Mandatory)][ValidatePattern('^[A-Fa-f0-9]{40}$')][string]$CertificateThumbprint,
    [string]$SourcePath = (Join-Path $PSScriptRoot '..\..'),
    [string]$WorkRoot
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Run this script on the Windows signing PC.' }
. (Join-Path $PSScriptRoot 'Toolchain.ps1')
$toolchain = Get-UpForgeToolchain
if ([string]::IsNullOrWhiteSpace($env:VITE_ERROR_REPORTING_KEY)) { throw 'Set VITE_ERROR_REPORTING_KEY locally to match the existing release configuration. Do not paste its value into chat.' }
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE." }
}
function Assert-Hash([string]$Path, [string]$Expected) {
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Expected) { throw "Download checksum mismatch: $Path" }
}

$readinessText = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Check-PC.ps1') -Json
if ($LASTEXITCODE -ne 0) { throw "PC prerequisites are incomplete. Run Check UpForge PC.cmd first.`n$readinessText" }
$readiness = $readinessText | ConvertFrom-Json
$signTool = ($readiness.checks | Where-Object name -eq 'SignTool').detail
$node = if ($toolchain.mode -eq 'configured') { $toolchain.node } else { (Get-Command node.exe -CommandType Application).Source }
$github = if ($toolchain.mode -eq 'configured') { $toolchain.github } else { (Get-Command gh.exe -CommandType Application).Source }
$npm = Join-Path (Split-Path $node) 'node_modules\npm\bin\npm-cli.js'
$CertificateThumbprint = $CertificateThumbprint.ToUpperInvariant()
$cert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$CertificateThumbprint"
if (-not $cert.HasPrivateKey -or $cert.NotBefore -gt (Get-Date) -or $cert.NotAfter -le (Get-Date)) { throw 'The selected signing certificate is unavailable or expired.' }
if ($cert.Subject -eq $cert.Issuer) { throw 'A self-signed certificate cannot identify a public release publisher.' }
if (@($cert.EnhancedKeyUsageList | Where-Object { $_.ObjectId.Value -eq '1.3.6.1.5.5.7.3.3' }).Count -eq 0) { throw 'The selected certificate is not for code signing.' }
$chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
try {
    $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::Online
    if (-not $chain.Build($cert)) { throw 'Windows could not validate the selected certificate chain and revocation status.' }
} finally { $chain.Dispose() }
$publisher = $cert.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
if ([string]::IsNullOrWhiteSpace($publisher)) { throw 'The certificate has no publisher name.' }

$SourcePath = (Resolve-Path -LiteralPath $SourcePath).Path
$origin = & git.exe -C $SourcePath remote get-url origin
if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^(https://github\.com/|git@github\.com:)LRAFam/upforge-desktop(\.git)?$') { throw 'Source must be the LRAFam/upforge-desktop repository.' }
$commit = & git.exe -C $SourcePath rev-parse --verify "refs/tags/$Tag^{commit}"
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[a-f0-9]{40}$') { throw 'The requested release tag is missing. No tag is created automatically.' }
if (-not $WorkRoot) { $WorkRoot = Join-Path $env:LOCALAPPDATA 'UpForge\release-work' }
$WorkRoot = [IO.Path]::GetFullPath($WorkRoot)
$work = Join-Path $WorkRoot "$Tag-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$source = Join-Path $work 'source'
$output = Join-Path $work 'dist'
New-Item -ItemType Directory -Path $source, $output | Out-Null
Write-Host "Building $Tag at $commit for $publisher. Working folder: $work"
# An isolated archive includes only the exact tag, never uncommitted changes.
Invoke-Checked 'git.exe' @('-C', $SourcePath, 'archive', '--format=tar', "--output=$work\source.tar", $commit)
Invoke-Checked 'tar.exe' @('-xf', "$work\source.tar", '-C', $source)
$package = Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw | ConvertFrom-Json
if ("v$($package.version)" -ne $Tag) { throw 'Tag and package.json version do not match.' }
if ($package.build.appId -ne 'gg.upforge.desktop') { throw 'Unexpected app identity.' }
$assets = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'assets.json') -Raw | ConvertFrom-Json

$savedEnvironment = @{}
foreach ($name in @('UPFORGE_SIGNTOOL', 'UPFORGE_SIGN_CERT', 'UPFORGE_SIGN_LOG', 'CSC_IDENTITY_AUTO_DISCOVERY', 'HUSKY', 'PATH')) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
Push-Location $source
try {
    if ($toolchain.mode -eq 'configured') { $env:PATH = (@($toolchain.directories) + @($env:PATH)) -join [IO.Path]::PathSeparator }
    $env:HUSKY = '0'
    Invoke-Checked $node @($npm, 'ci', '--include=dev')
    Invoke-Checked $node @($npm, 'run', 'type-check')
    Invoke-Checked $node @($npm, 'test')
    New-Item -ItemType Directory -Force -Path 'resources\ffmpeg', 'resources\trainer' | Out-Null
    $zip = Join-Path $work 'ffmpeg.zip'
    Invoke-WebRequest -UseBasicParsing -Uri $assets.ffmpeg.url -OutFile $zip
    Assert-Hash $zip $assets.ffmpeg.sha256
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $work 'ffmpeg')
    Copy-Item -LiteralPath (Join-Path (Join-Path $work 'ffmpeg') $assets.ffmpeg.executable) -Destination 'resources\ffmpeg\ffmpeg.exe'
    Invoke-Checked $github @('release', 'download', $assets.trainer.tag, '--repo', $assets.trainer.repository, '--pattern', $assets.trainer.asset, '--dir', 'resources\trainer')
    Assert-Hash 'resources\trainer\upforge-trainer.exe' $assets.trainer.sha256

    $env:UPFORGE_SIGNTOOL = $signTool
    $env:UPFORGE_SIGN_CERT = $CertificateThumbprint
    $env:UPFORGE_SIGN_LOG = Join-Path $work 'signing.jsonl'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    # Use a complete config, retaining UpForge's NSIS hooks and resource layout.
    $config = $package.build
    $config.directories.output = $output
    $config | Add-Member -NotePropertyName forceCodeSigning -NotePropertyValue $true -Force
    $config | Add-Member -NotePropertyName afterSign -NotePropertyValue (Join-Path $PSScriptRoot 'after-sign.cjs') -Force
    $config.win | Add-Member -NotePropertyName signExts -NotePropertyValue @('.exe', '.dll', '.node') -Force
    $config.win | Add-Member -NotePropertyName signtoolOptions -NotePropertyValue @{
        signingHashAlgorithms = @('sha256')
        sign = (Join-Path $PSScriptRoot 'sign-hook.cjs')
        certificateSha1 = $CertificateThumbprint
        publisherName = @($publisher)
    } -Force
    $configPath = Join-Path $work 'builder.json'
    # Windows PowerShell's UTF8 includes a BOM; Node config loaders expect plain UTF8.
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 50), (New-Object Text.UTF8Encoding($false)))
    Invoke-Checked $node @($npm, 'run', 'build')
    Invoke-Checked $node @((Join-Path $source 'node_modules\electron-builder\cli.js'), '--win', '--x64', '--publish', 'never', '--config', $configPath)
    Invoke-Checked $node @((Join-Path $PSScriptRoot 'verify-output.cjs'), $output, $package.version, $CertificateThumbprint, $commit)
    Write-Host "`nVerified release prepared at $output"
    Write-Host 'Nothing has been uploaded or published. Keep the full working folder for verification.'
} finally {
    Pop-Location
    foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}
