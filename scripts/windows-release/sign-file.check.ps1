# Exercise the real signing script with simulated Windows certificate/tool results.
# No real certificates, hardware keys or signatures are created by these tests.
$ErrorActionPreference = 'Stop'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$file = Join-Path $testRoot 'fixture.exe'
$report = Join-Path $testRoot 'receipt.json'
$expected = 'A' * 40
$originalOS = $env:OS
$scriptUnderTest = Join-Path $PSScriptRoot 'Sign-File.ps1'
$passed = 0

function New-TestSignature($Status, $Thumbprint, $Timestamped) {
    $cert = [pscustomobject]@{ Thumbprint = $Thumbprint }
    $cert | Add-Member -MemberType ScriptMethod -Name GetNameInfo -Value { param($Kind, $Issuer) 'Fixture publisher' }
    [pscustomobject]@{ Status = $Status; SignerCertificate = $cert; TimeStamperCertificate = $(if ($Timestamped) { [pscustomobject]@{ present = $true } } else { $null }) }
}
function Get-AuthenticodeSignature { param($LiteralPath) $global:UpForgeSigningFixture.signature }
function Invoke-FakeSignTool {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    if ($Arguments[0] -eq 'sign') {
        $global:UpForgeSigningFixture.signCalls++
        $global:LASTEXITCODE = $global:UpForgeSigningFixture.signExit
        if ($global:LASTEXITCODE -eq 0) {
            $global:UpForgeSigningFixture.signature = New-TestSignature 'Valid' ('A' * 40) $true
        }
    } elseif ($Arguments[0] -eq 'verify') {
        $global:UpForgeSigningFixture.verifyCalls++
        $global:LASTEXITCODE = $global:UpForgeSigningFixture.verifyExit
    } else { throw 'Unexpected signing tool command.' }
}
function Reset-Fixture($Signature) {
    if (Test-Path -LiteralPath $report) { Remove-Item -LiteralPath $report }
    $global:UpForgeSigningFixture = @{ signature = $Signature; signExit = 0; verifyExit = 0; signCalls = 0; verifyCalls = 0 }
}
function Invoke-Case($Name, $ShouldFail, $Options) {
    $failed = $false
    try {
        & $scriptUnderTest -Path $file -SignTool 'Invoke-FakeSignTool' -CertificateThumbprint $expected -ReportPath $report @Options
    } catch { $failed = $true }
    if ($failed -ne $ShouldFail) { throw "Unexpected result: $Name (failed=$failed)" }
    if ($ShouldFail -and (Test-Path -LiteralPath $report)) { throw "Failure produced a success receipt: $Name" }
    if (-not $ShouldFail) {
        $receipt = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
        if ($receipt.verified -ne $true) { throw "Missing verification: $Name" }
    }
    $script:passed++
    Write-Host "PASS: $Name"
}

try {
    Set-Content -LiteralPath $file -Value 'Not a real PE file: signing flow fixture.'
    $env:OS = 'Windows_NT'
    Reset-Fixture (New-TestSignature 'NotSigned' '' $false)
    Invoke-Case 'Unsigned file is signed and verified' $false @{ RequirePublisher = $true }
    if ($global:UpForgeSigningFixture.signCalls -ne 1 -or $global:UpForgeSigningFixture.verifyCalls -ne 1) { throw 'Expected one sign and one verify.' }

    Reset-Fixture (New-TestSignature 'Valid' ('B' * 40) $false)
    Invoke-Case 'Valid vendor signature is preserved' $false @{}
    if ($global:UpForgeSigningFixture.signCalls -ne 0) { throw 'Vendor signature was overwritten.' }

    Reset-Fixture (New-TestSignature 'HashMismatch' $expected $true)
    Invoke-Case 'Tampered file is rejected' $true @{}
    if ($global:UpForgeSigningFixture.signCalls -ne 0) { throw 'Invalid signature was overwritten.' }

    Reset-Fixture (New-TestSignature 'Valid' ('B' * 40) $true)
    Invoke-Case 'Wrong publisher on our executable is rejected' $true @{ RequirePublisher = $true }

    Reset-Fixture (New-TestSignature 'Valid' $expected $false)
    Invoke-Case 'Our signature without timestamp is rejected' $true @{}

    Reset-Fixture (New-TestSignature 'NotSigned' '' $false)
    Invoke-Case 'Verify-only never repairs an unsigned release' $true @{ VerifyOnly = $true }
    if ($global:UpForgeSigningFixture.signCalls -ne 0) { throw 'Verify-only signed a file.' }

    Reset-Fixture (New-TestSignature 'NotSigned' '' $false)
    $global:UpForgeSigningFixture.signExit = 1
    Invoke-Case 'SignTool signing failure stops the build' $true @{}

    Reset-Fixture (New-TestSignature 'Valid' $expected $true)
    $global:UpForgeSigningFixture.verifyExit = 2
    Invoke-Case 'SignTool verification warning/failure stops the build' $true @{}
    Write-Host "$passed signing-flow checks passed (simulated Windows responses)."
} finally {
    $env:OS = $originalOS
    Remove-Item -LiteralPath $testRoot -Recurse -Force
    Remove-Variable UpForgeSigningFixture -Scope Global -ErrorAction SilentlyContinue
}
