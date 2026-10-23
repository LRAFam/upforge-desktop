# Local Windows releases

This is UpForge's own release tool, using Windows SignTool and a certificate held
on a hardware key. It does not require a per-signature cloud subscription.
The certificate still needs to come from an issuer Windows trusts. A certificate
we issue ourselves would not provide public publisher trust.

## Before buying a key

Copy `Check-PC.ps1`, `Toolchain.ps1` and `Check UpForge PC.cmd` together to the Windows computer,
then double-click **Check UpForge PC.cmd**. It saves `pc-readiness.json` beside
the checker. It reads the computer's configuration and checks GitHub repository
access. It does not install anything, change settings, sign or publish.

The prerequisites are Windows x64, Windows PowerShell 5.1+, Node 22 with npm,
Git, GitHub CLI signed in with access to the desktop and trainer repositories,
Windows SDK SignTool, tar, and 15 GB of free working space. Node 22 matches the
current GitHub release workflow. The key and its driver are reported as pending,
not as tested or ready. Driver installation, hardware PIN behaviour and a real
signature need the purchased key.

Both launchers use an execution-policy override for their own PowerShell process
only. They do not change the computer's saved execution policy. Administrator
rights are not required to run the scripts; installing the SDK or driver may
require Windows approval.

UpForge can use its own portable Node and GitHub CLI installations without
replacing tools used by other projects. When `%LOCALAPPDATA%\UpForge\toolchain.json`
exists, both scripts use the explicitly selected directories:

```json
{
  "schemaVersion": 1,
  "nodeDirectory": "C:\\Users\\YOUR_USER\\AppData\\Local\\UpForge\\tools\\node-v22.X.Y-win-x64",
  "githubDirectory": "C:\\Users\\YOUR_USER\\AppData\\Local\\UpForge\\tools\\github-cli\\bin"
}
```

Use the actual installed directories, containing `node.exe` with its bundled npm
and `gh.exe`. The build adds these directories to its own process PATH while
running dependencies and packaging, then restores it. It never changes the user
or machine PATH. If no configuration file exists, the scripts use the existing
PATH. An invalid configuration is reported as an error and must be corrected.

## Prepare a signed release after enrolment

Keep this folder inside an UpForge desktop checkout. Double-click
**Sign UpForge Release.cmd**, or run:

```powershell
.\scripts\windows-release\Build-Release.ps1 -Tag vX.Y.Z -CertificateThumbprint YOUR_CERTIFICATE_THUMBPRINT
```

Replace the placeholders with the intended stable tag and the exact code-signing
certificate thumbprint from `Cert:\CurrentUser\My`. A thumbprint is a public
certificate identifier, not the key or PIN. Enter the PIN only in the hardware
provider's Windows prompt. The script does not accept or store PINs.
Set `VITE_ERROR_REPORTING_KEY` locally to the value used by the existing GitHub
release workflow before building. It is not written to readiness reports.

The script archives the exact local Git tag into a fresh folder under
`%LOCALAPPDATA%\UpForge\release-work`. It does not modify the original checkout,
commit changes, create tags or include uncommitted work. It installs locked
dependencies in that isolated folder, runs type checking and tests, downloads
pinned helpers with SHA-256 checks, and builds Windows x64 NSIS artifacts.
The first version deliberately performs the build on the signing PC; the PC
must stay awake through downloading, building and verification.

Signing covers the application, bundled EXE/DLL/native-module files, the NSIS
uninstaller and the final installer. It preserves valid existing vendor
signatures, refuses invalid ones, requires the selected publisher for UpForge's
own executables, and requires timestamps on new signatures. It never continues
with unsigned files when signing fails. An after-sign scan covers nested native
files before NSIS packages them. A second scan checks the finished payload.

The builder creates update metadata and blockmaps after signing. The final
check compares the installer filename, version, size and SHA-512 against
`latest.yml`. It also checks the temporary uninstaller's verification receipt,
because NSIS deletes that temporary file after embedding it. Keep the complete
working folder, including `signing.jsonl`, `source` and `dist`, until release
verification is complete.

## Publication is a later cutover

This preparation tool intentionally has no publishing command. Success produces
local signed artifacts and `dist/release-report.json`; it does not upload or
replace a release. The existing GitHub release workflow still publishes through
its current path. Do not assume this local tool changes that workflow or makes
current public releases signed.

Before the first real signed release, test with the hardware key on Windows,
verify install/uninstall and an update from the current public version, then
change the release workflow so it stages artifacts and only publishes after
Windows and macOS verification. That cutover requires explicit release approval.
Use an unpublished draft to upload all assets before making it public; never
overwrite an existing public release or expose updater metadata before its
installer is available. macOS still needs Apple signing/notarization and its own
verification. Nothing here signs macOS releases.

`assets.json` pins the same helper versions as the current Windows workflow.
The ffmpeg archive hash was measured on 18 October 2026; its executable matched
the audited v2.14.6 release. The trainer hash came from its GitHub release-asset
digest. Updating either helper requires reviewing and updating this manifest.
The first implementation uses no shared signing cache: hardware signing has no
per-signature fee, so a cache would add complexity without reducing that bill.

## Verification

```text
node --test scripts/windows-release/release-policy.check.cjs
powershell.exe -NoProfile -File scripts/windows-release/sign-file.check.ps1
```

These checks exercise updater metadata tampering, publisher requirements,
missing/untrusted uninstaller receipts and complete native-file enumeration.
The PowerShell tests run the real signing script with simulated Windows
signature and SignTool results, including signing and verification failures.
They do not replace a real hardware signing, Windows trust, installation or
update test. Run `Check-PC.ps1` on Windows to obtain the actual PC report.

References:
- https://www.ssl.com/how-to/using-your-code-signing-certificate/
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
