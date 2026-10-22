# Windows code signing

Signed installers stop "Unknown publisher" warnings and let SmartScreen build reputation for UpForge.

## The rule

- **Tagged releases** (`vX.Y.Z`) are signed by `.github/workflows/release.yml` using the provider in the repo variable `WIN_SIGNING_PROVIDER`.
- Once `WIN_SIGNING_PROVIDER` is set, **every release must be signed**. The **Verify Windows signature** step checks each `.exe` with Windows' own signature check and the expected publisher name. If anything is unsigned or signed by someone else, the job fails and the release is **not published**.
- Until a provider is connected, releases still build unsigned, with a warning on the workflow run.
- Branch builds (pushes to `main`) are never signed, so they don't use paid signatures.
- `build/release-signing.test.ts` fails CI if the signature check is removed or weakened.

Do not unset `WIN_SIGNING_PROVIDER` to "get a release out". Fix the signing problem instead.

## Option A — Azure Artifact Signing (needs a registered company)

About $9.99/month for 5,000 signatures. Certificate shows the company name.

1. Create an Azure account and an **Artifact Signing** (formerly Trusted Signing) account. Note its **endpoint** (region URL) and **account name**.
2. Complete **identity validation** for the organisation.
3. Create a **certificate profile** (Public Trust). Note its name.
4. Create an **App registration** with a client secret. Give it the role **Artifact Signing Certificate Profile Signer** (may still be called *Trusted Signing Certificate Profile Signer*) on the signing account.
5. In GitHub → `upforge-desktop` → Settings → Secrets and variables → Actions:

| Type | Name | Value |
|---|---|---|
| Secret | `AZURE_TENANT_ID` | Directory (tenant) ID |
| Secret | `AZURE_CLIENT_ID` | App registration client ID |
| Secret | `AZURE_CLIENT_SECRET` | App registration secret |
| Variable | `AZURE_SIGNING_ENDPOINT` | e.g. `https://weu.codesigning.azure.net/` |
| Variable | `AZURE_SIGNING_ACCOUNT` | Signing account name |
| Variable | `AZURE_SIGNING_PROFILE` | Certificate profile name |
| Variable | `WIN_SIGNING_PUBLISHER` | Exact certificate name (CN), e.g. `UpForge Ltd` |
| Variable | `WIN_SIGNING_PROVIDER` | `azure` — **set this last; it switches the rule on** |

## Option B — SSL.com eSigner (works for individuals)

Individual (IV) certificate plus an eSigner cloud-signing plan. Certificate shows your own name.

1. Buy an **IV (or OV) code signing certificate** at SSL.com and finish validation.
2. Enrol it in **eSigner** and save the **TOTP secret** (the text behind the QR code). Note your **credential ID**.
3. Download **CodeSignTool for Windows** from SSL.com. Copy the download URL and work out the zip's SHA-256 (`Get-FileHash file.zip -Algorithm SHA256` or `shasum -a 256 file.zip`).
4. In GitHub → `upforge-desktop` → Settings → Secrets and variables → Actions:

| Type | Name | Value |
|---|---|---|
| Secret | `ES_USERNAME` | SSL.com account username |
| Secret | `ES_PASSWORD` | SSL.com account password |
| Secret | `ES_CREDENTIAL_ID` | eSigner credential ID |
| Secret | `ES_TOTP_SECRET` | eSigner TOTP secret |
| Variable | `SSLCOM_CODESIGNTOOL_URL` | CodeSignTool zip URL |
| Variable | `SSLCOM_CODESIGNTOOL_SHA256` | SHA-256 of that zip |
| Variable | `WIN_SIGNING_PUBLISHER` | Exact certificate name (CN), e.g. your full name |
| Variable | `WIN_SIGNING_PROVIDER` | `sslcom` — **set this last; it switches the rule on** |

Each release signs a few files (app, installer, uninstaller). Pick an eSigner plan with enough signatures for how often you release.

## First signed release

1. Bump `package.json` version and push to `main` as usual.
2. Open the **Build Installers** run for the new tag. In **Verify Windows signature** every `.exe` should show `Valid (signer: <your publisher>)`.
3. Download the installer from the GitHub release → right-click → Properties → **Digital Signatures** shows the publisher.

SmartScreen may still warn for a short while on a brand-new certificate until downloads build reputation.

## Changing the publisher name later

With Azure signing, electron-builder writes the publisher name into the app's auto-update settings, and installed apps only accept updates signed by that name. If you ever move to a certificate with a **different name** (for example from your own name to a company), set `win.publisherName` in `package.json` to a list containing **both** names for at least one release before switching, so existing installs keep updating.
