# Read-only. No installations, registry writes, signing or publication.
[CmdletBinding()]
param([switch]$Json, [string]$ReportPath)

$ErrorActionPreference = 'Stop'
$checks = New-Object 'System.Collections.Generic.List[object]'
function Add-Check($Name, $Status, $Detail) {
    $checks.Add([pscustomobject]@{ name = $Name; status = $Status; detail = $Detail })
}

$windows = $env:OS -eq 'Windows_NT'
if (-not $windows) {
    Add-Check 'Windows' 'missing' 'Run this check on the Windows signing PC.'
} else {
    . (Join-Path $PSScriptRoot 'Toolchain.ps1')
    $toolchain = $null
    try {
        $toolchain = Get-UpForgeToolchain
        Add-Check 'Tool selection' 'ok' $(if ($toolchain.mode -eq 'configured') { $toolchain.configPath } else { 'Using tools on PATH; no UpForge toolchain.json is configured.' })
    } catch {
        Add-Check 'Tool selection' 'missing' $_.Exception.Message
    }
    $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    Add-Check 'Windows x64' $(if ($architecture -eq 'X64') { 'ok' } else { 'missing' }) $architecture
    Add-Check 'PowerShell' $(if ($PSVersionTable.PSVersion -ge [version]'5.1') { 'ok' } else { 'missing' }) $PSVersionTable.PSVersion.ToString()
    Add-Check 'PowerShell x64' $(if ([Environment]::Is64BitProcess) { 'ok' } else { 'missing' }) 'Use the 64-bit Windows PowerShell launcher.'
    foreach ($tool in @('node.exe', 'git.exe', 'gh.exe', 'tar.exe')) {
        if ($null -eq $toolchain -and $tool -in @('node.exe', 'gh.exe')) {
            Add-Check $tool 'missing' 'Fix the invalid UpForge toolchain configuration before selecting these tools.'
            continue
        }
        $toolPath = $tool
        if ($null -ne $toolchain -and $toolchain.mode -eq 'configured') {
            if ($tool -eq 'node.exe') { $toolPath = $toolchain.node }
            if ($tool -eq 'gh.exe') { $toolPath = $toolchain.github }
        }
        $command = Get-Command $toolPath -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -eq $command) {
            Add-Check $tool 'missing' 'Not installed or not on PATH.'
            continue
        }
        Add-Check $tool 'ok' $command.Source
        if ($tool -eq 'node.exe') {
            $nodeVersion = & $command.Source --version
            Add-Check 'Node 22' $(if ($LASTEXITCODE -eq 0 -and $nodeVersion -match '^v22\.') { 'ok' } else { 'missing' }) "$nodeVersion (matches the release workflow)"
            $nodeArchitecture = & $command.Source -p 'process.arch'
            Add-Check 'Node x64' $(if ($LASTEXITCODE -eq 0 -and $nodeArchitecture -eq 'x64') { 'ok' } else { 'missing' }) "$nodeArchitecture (required for Windows x64 native modules)"
            $npm = Join-Path (Split-Path $command.Source) 'node_modules\npm\bin\npm-cli.js'
            Add-Check 'npm' $(if (Test-Path -LiteralPath $npm) { 'ok' } else { 'missing' }) $npm
        }
        if ($tool -eq 'gh.exe') {
            foreach ($repo in @('LRAFam/upforge-desktop', 'LRAFam/upforge-trainer')) {
                # Inspect access without printing account credentials or auth tokens.
                # Windows PowerShell can treat native stderr as an ErrorRecord.
                # A failed login should be a missing check, not abort the report.
                $previousPreference = $ErrorActionPreference
                try {
                    $ErrorActionPreference = 'Continue'
                    $response = & $command.Source api "repos/$repo" --jq '.full_name' 2>$null
                    $accessible = $LASTEXITCODE -eq 0 -and $response -eq $repo
                } finally { $ErrorActionPreference = $previousPreference }
                Add-Check "GitHub access: $repo" $(if ($accessible) { 'ok' } else { 'missing' }) $(if ($accessible) { 'Accessible' } else { 'Access could not be verified. Check network access and GitHub CLI sign-in for this repository.' })
            }
        }
    }
    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    $signTools = @(Get-ChildItem -Path "$sdkRoot\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
        Sort-Object { [version]$_.Directory.Parent.Name } -Descending)
    Add-Check 'SignTool' $(if ($signTools.Count) { 'ok' } else { 'missing' }) $(if ($signTools.Count) { $signTools[0].FullName } else { 'Install Windows SDK Signing Tools for Desktop Apps.' })
    $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($env:LOCALAPPDATA).Substring(0, 1))
    $freeGB = [math]::Round($drive.Free / 1GB, 1)
    Add-Check 'Working space' $(if ($freeGB -ge 15) { 'ok' } else { 'missing' }) "$freeGB GB free; allow at least 15 GB for an isolated build."
    Add-Check 'Signing key and driver' 'pending' 'Expected before purchase. The physical key, PIN prompts and certificate will be tested after enrolment.'
    Add-Check 'Release configuration' $(if ([string]::IsNullOrWhiteSpace($env:VITE_ERROR_REPORTING_KEY)) { 'pending' } else { 'ok' }) $(if ([string]::IsNullOrWhiteSpace($env:VITE_ERROR_REPORTING_KEY)) { 'VITE_ERROR_REPORTING_KEY is not set for this process. Configure it locally before building; never include its value in this report.' } else { 'VITE_ERROR_REPORTING_KEY is set for this process; its value is not reported or validated.' })
}

$report = [pscustomobject]@{
    schemaVersion = 1
    checkedAt = [DateTime]::UtcNow.ToString('o')
    prerequisitesReady = (@($checks | Where-Object status -eq 'missing').Count -eq 0)
    signingReady = $false
    checks = @($checks.ToArray())
}
$encoded = $report | ConvertTo-Json -Depth 6
if ($ReportPath) { $encoded | Set-Content -LiteralPath $ReportPath -Encoding UTF8 }
if ($Json) {
    $encoded
} else {
    Write-Host "`nUpForge Windows readiness`n"
    foreach ($check in $checks) { Write-Host "[$($check.status.ToUpper())] $($check.name): $($check.detail)" }
    Write-Host "`nThis check does not install software, sign files or publish a release."
}
# A missing key is expected at this stage; it never means signing has been tested.
if (-not $report.prerequisitesReady) { exit 1 }
