# Code signing policy

This document states which KalderaShield release artifacts are signed, by whom,
under what key custody arrangement, and who is accountable for approving each
signature. It is the page SignPath Foundation asks for, and it is written to be
read by someone who has never seen this project before.

Public version of this document:
<https://kalderashield.com/code-signing-policy.html>

## Windows

**Free code signing provided by [SignPath.io](https://signpath.io), certificate
by [SignPath Foundation](https://signpath.org).**

Status: **application prepared, preconditions met.** KalderaShield is applying to
the SignPath Foundation program and has met every stated precondition: Windows
installers are published in the form that should be signed, the project page is
live, and this policy is linked from the home page and the download page in
every language. What remains is submitting the form, confirming multi-factor
authentication on the accounts, and confirming that the security contact
address is answered.

Nothing in this section should be read as a claim that a Windows artifact is
currently signed. It is not signed. Until the first signed release actually
ships, the honest statement is the one in "Current status" below, and this
section is updated before, not after, that release.

### What will be signed

- `KalderaShield_<version>_x64-setup.exe` — the NSIS installer
- `KalderaShield_<version>_x64.msi` — the MSI package for managed deployment
- `KalderaShield_<version>_x64-portable.exe` — the portable executable

All three are built from this repository and published on the
[releases page](https://github.com/hafgit99/kalderashield/releases). Artifacts
not built from this repository are not signed with this project's certificate,
and no third-party binary is re-signed under it.

### Key custody

The private key is generated and stored on SignPath's HSM. This project never
holds it, never exports it, and never transmits it to a build runner or a
developer machine. Signing happens on SignPath's side, in response to a
signature request that this repository's CI submits and a human approves. A
build runner therefore cannot be coerced into signing anything: it can only ask.

### Build and approval chain

1. A version tag is pushed to this repository.
2. GitHub Actions builds the Windows artifacts on a GitHub-hosted runner. The
   workflows are public, their third-party actions are pinned by commit SHA, and
   their token permissions are read-only.
3. The build uploads the artifacts to SignPath and raises a signature request.
   It does not sign.
4. An Approver (below) reviews the request and approves or rejects it.
5. SignPath signs the artifact with the Foundation certificate and returns it.
6. The signed artifact is published to the release together with
   `SHA256SUMS.txt`.

Every release requires manual approval. There is no unattended signing path and
none will be added: SignPath's certificate carries SignPath's name, so an
approval that nobody made would be a misrepresentation rather than a
convenience.

### What SignPath's signature does and does not mean

A valid SignPath Foundation signature means the binary is a verifiable,
automated build of the source code in this repository at the commit the release
names. It does not mean the software has been audited, and it is not a
security endorsement of the application. This project publishes a threat model
and quality-gate documentation, but has no completed independent third-party
security audit. See [Security Review Status](docs/SECURITY_REVIEW_STATUS_2026.md)
for what that document does and does not claim.

## Desktop auto-updater (Tauri updater / minisign)

This is a separate trust chain from everything above, and it is the one most
likely to be assumed covered when it is not. Authenticode, GPG and the Android
keystore all sign the artifact **file**. The updater signs a **manifest**, and
that manifest is what a shipped client fetches and acts on without asking.

### What the manifest is and where it comes from

The Tauri updater reads `latest.json` from the release endpoint declared in
`src-tauri/tauri.conf.json`:

```
https://github.com/hafgit99/kalderashield/releases/latest/download/latest.json
```

`latest.json` lists each artifact with its platform, version, SHA-256 and URL,
and carries a `signature` field. That signature is **minisign** over the
canonical JSON body, produced by the same build that produced the artifact —
`scripts/generate-updater-manifest.cjs` reads the `.sig` files the Tauri CLI
writes and refuses to publish if no artifact carries a valid one. The manifest
and every `latest.json.sigstore.json` beside it are uploaded to the release, and
the mirror step copies the same two files.

### Key custody — weaker than the Windows section, and stated as such

| | Windows (SignPath) | Updater (minisign) |
|---|---|---|
| Private key location | SignPath's HSM | GitHub Actions repository secret |
| Does this project hold it | No | No, directly — but see below |
| A build runner can be made to sign | Only by asking, then a human approves | Yes, by asking. Nothing else stands between it and a signature |
| Revocable | Yes, by SignPath | Only by shipping a new application |

`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are stored
as GitHub Actions secrets and are exposed to the desktop build step
(`_reusable-desktop-build.yml`). GitHub encrypts secrets at rest and masks them
in logs, but a workflow with the secret in its environment **can exfiltrate
it**, and unlike SignPath there is no human approval step between "the runner
asks" and "the signature exists".

The mitigating property, and it is a real one: the client does not trust a
signature, it trusts a **pinned public key**. That key is compiled into every
shipped binary as `plugins.updater.pubkey`. An attacker who obtains the private
key cannot use it against an already-installed client, because those clients
verify against the key already inside them. They can publish a manifest that
newly-updated clients would accept, and any client still on the old key will
reject it. Rotating the key therefore requires releasing a new application
version, which is why the response to a suspected compromise is "ship a release
that pins a new key", and why that path needs to be known before it is needed.

```
untrusted comment: minisign public key: 5ADF998A224AF97D
RWR9+UoiipnfWrnQGHCwhio0FBecAKJe6EEAPgdgMNpOWBTVAprmShEN
```

### Key generation, custody and recovery — the gap

The following are **not recorded anywhere else**, and are called out here
rather than left implied:

- **How the key was generated.** Not recorded. Tauri's documented route is
  `npm run tauri signer generate -w ~/.tauri/myapp.key`, which prompts for a
  password; a key produced any other way may differ in entropy source.
- **Where the encrypted private key is backed up, and whether that backup has
  been tested.** Not recorded.
- **Who besides the repository owner can restore it.** Not recorded, and the
  honest answer today is "nobody", which is the same single-person exposure
  already stated in the Team roles section.
- **What happens on suspected compromise.** Not recorded as a procedure.

These are the items to fill in, and they are filled in by the person who holds
the key rather than by anyone reading this document.

### What happens without the key

Fail-closed, in code rather than in policy. `scripts/desktop-release-gate.cjs`
and `scripts/local-release.cjs` both pass
`bundle.createUpdaterArtifacts: false` when `TAURI_SIGNING_PRIVATE_KEY` is
absent, so a build without the key produces **no updater bundles and no
manifest** rather than an unsigned one. `build-windows-unsigned.yml` relies on
this and states so. A release therefore cannot ship an updater manifest that
nothing signed.

### What a valid updater signature does and does not mean

It means the manifest was produced by a build that held the signing key, and
that the artifacts it names are the ones this project published. It does not
mean the software has been audited, and it is not a security endorsement. See
[Security Review Status](docs/SECURITY_REVIEW_STATUS_2026.md), which says the
same thing for the other signature types.

## Team roles

KalderaShield is maintained by a single person. That is stated here rather than
presented as a team, because the roles below are the ones SignPath requires and
a single maintainer can only honestly fill them alone. A second Approver is
intended; until one exists, the separation between "the person who writes the
code" and "the person who approves the signature" does not exist, and this
project will say so if asked.

All accounts with write access to this repository use multi-factor
authentication.

### Authors

People who may modify the source code without additional review:

- `hafgit99` — <https://github.com/hafgit99>

This is the only account with write access. The repository is owned by a
personal account rather than an organisation, so the write path is a single
identity with MFA on it.

### Reviewers

Every change proposed by someone who is not a committer is reviewed by a team
member before merge:

- `hafgit99`

There are no non-committer contributors at present, so this role is currently
vacant in practice rather than merely thin.

### Approvers

Each signature request must be approved before the artifact is signed:

- `hafgit99`

**Known gap:** with one person holding all three roles, the person who writes
the code also approves its signature. SignPath's model assumes an Approver is
"trusted by the entire team", which presumes more than one team member. Adding a
second Approver is the one remaining structural item on the application, and it
is named as such rather than left to be discovered during review. A reviewer who
considers this disqualifying should say so now rather than after approval.

## Privacy policy

<https://kalderashield.com/privacy.html>

In the terms SignPath asks for: **this program will not transfer any information
to other networked systems unless specifically requested by the user or the
person installing or operating it.**

KalderaShield is an offline-first, zero-knowledge password manager. Vault
contents are encrypted on the device with keys derived from the master password
and are never transmitted. There is no account, no sync service, no telemetry and
no analytics.

The application does not have unrestricted network access to begin with. An
air-gap policy wraps `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and
`navigator.sendBeacon` (`src/lib/airgapNetworkPolicy.ts`) and allows a request
only to the app's own origin, to a sync server the user has configured
themselves, and to one further origin described below. WebRTC is blocked
entirely. There is exactly one exception, and it is opt-in:

**Breach checking (optional, off by default).** The Security Audit screen can
ask Have I Been Pwned whether a password appears in a known breach corpus. It
uses the k-anonymity range API: the app sends the first five hex characters of
the SHA-1 digest of the password and nothing else, and requests response
padding so the answer's size cannot be correlated back to the query. No
password, and no material derived from it beyond that five-character prefix,
reaches the third party or this project.

This check is **off unless the user turns it on**. That is a change, not a
description of an accident: it used to be on by default, which meant opening
the Security Audit screen contacted a third-party server for every password in
the vault, and the privacy policy did not mention it. Both the default and the
policy text were corrected together — the policy is only worth publishing if it
is true, and a certificate issuer reads it closely.

Third-party components whose behaviour affects users are covered by
[License-3rd-PARTY.md](LICENSE-3RD-PARTY.md) and by the privacy policy, which
names the hosting provider's access logs and the browser-extension stores as the
only third parties a user interacts with.

## macOS

macOS artifacts are signed with an Apple Developer ID and notarized by Apple.
The certificate is not yet issued, so no macOS artifact has been signed and none
is published. This is stated in the same terms as the Windows section: no
platform is described as signed until it is.

## Linux

Linux artifacts (`.deb`, `.rpm`, `.AppImage`) are published with detached
signatures:

- `.deb` and `.rpm` — detached GPG signatures (`.sig`)
- `.AppImage` — detached GPG signature (`.sig`)
- SBOMs and browser-extension packages — Sigstore keyless signatures
  (`.sigstore.json`)

The public keys are published in the release notes. Verification instructions
are on <https://kalderashield.com/guvenlik/dogrulama/>.

## Android

Android release APKs are signed with a release keystore held in GitHub Actions
secrets. The keystore password and key password are distinct. Android signing is
separate from Authenticode and is unaffected by anything on this page.

## Current status

| Platform | Published | Signed | By whom |
| --- | --- | --- | --- |
| Linux | Yes | Yes | Detached GPG + Sigstore |
| Android | Yes | Yes | Release keystore |
| Browser extension | Yes | Yes | Sigstore keyless (store signatures for Chrome/Firefox) |
| Desktop auto-updater manifest | Yes | Yes | Tauri minisign (see the updater section) |
| Windows | **Preview only** | **No** | Application prepared; no decision pending |
| macOS | No | No | Certificate not yet issued |

Windows artifacts are published as an explicitly labelled **unsigned preview**,
not as a normal release. That shape was chosen because of a stated precondition
of the SignPath application: their terms require the project to have already
released the software in the form that should be signed, so one release in that
form had to exist before an application could be made at all. Five now do
(v7.0.20 through v7.0.24), which is the precondition being satisfied — not a
workaround, and not a channel that outlives signing.

The fail-closed gate in `release-desktop.yml` is unchanged and still blocks any
unsigned artifact from a normal release tag, and there is no workflow in
`.github/workflows/` that can publish one. The preview is assembled and uploaded
by hand, from the maintainer's machine through GitHub's own release form, marked
as a pre-release — so it is visibly provisional, `latest` never points at it, and
the next signed release replaces it.

That route is deliberate rather than a workaround. The repository contains a
security gate (`npm run security:release-signing`) that fails any workflow capable
of turning an unsigned build into a published one, and its closing claim is that
without the signing secrets a public desktop release is *impossible by design*.
Adding an exception for a workflow would have made that claim false in exchange
for a convenience. Keeping the upload in a browser keeps the guarantee intact. The
gate is documented in
[Code Signing & Artifact Signing Guide](docs/CODE_SIGNING_GUIDE_2026.md), and the
step-by-step procedure is in
[Plan: site, then the unsigned Windows preview](docs/WINDOWS_UNSIGNED_RELEASE_PLAN.md).

## Reporting a problem

If you believe an artifact signed with a SignPath Foundation certificate
violates this policy, report it to
[support@signpath.io](mailto:support@signpath.io) with the artifact's hash and
the reason. For anything else about these artifacts, use
[security@kalderashield.com](mailto:security@kalderashield.com); the disclosure
process is in [SECURITY.md](SECURITY.md).
