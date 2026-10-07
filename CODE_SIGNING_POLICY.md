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

Status: **not yet applied.** KalderaShield intends to apply to the SignPath
Foundation and has prepared this policy in advance, because their terms require
it to exist before an application is made. The application has not been submitted
and no decision is pending.

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
second Approver is planned and not yet done. A reviewer who considers this
disqualifying should say so now rather than after approval.

## Privacy policy

<https://kalderashield.com/privacy.html>

In the terms SignPath asks for: **this program will not transfer any information
to other networked systems unless specifically requested by the user or the
person installing or operating it.**

KalderaShield is an offline-first, zero-knowledge password manager. Vault
contents are encrypted on the device with keys derived from the master password
and are never transmitted. There is no account, no sync service, no telemetry and
no analytics. The Windows binaries contain no network client of any kind beyond
the operating system's own component.

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
| Windows | **Preview only** | **No** | Application not yet submitted |
| macOS | No | No | Certificate not yet issued |

Windows artifacts are published as an explicitly labelled **unsigned preview**,
not as a normal release. The reason is a stated precondition of the SignPath
application: their terms require the project to have already released the software
in the form that should be signed, so one unsigned release has to exist before the
application can be made at all.

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
