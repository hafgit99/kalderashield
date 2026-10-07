# SignPath Foundation application — values to submit

Copy-paste reference for the SignPath Foundation open-source code-signing
application at <https://signpath.org/apply>.

**Status: PREPARED, NOT SUBMITTED.** The application is deliberately deferred
until the unsigned Windows preview is published and the site is live — see
[WINDOWS_UNSIGNED_RELEASE_PLAN.md](WINDOWS_UNSIGNED_RELEASE_PLAN.md) for that
sequence. Nothing here is submitted automatically; sending the form is a manual
step.

## Preconditions — all three before submitting

| # | Gate | State |
| --- | --- | --- |
| 1 | A Windows release exists on the releases page | **Not met.** Zero Windows assets. Satisfied by the unsigned preview. |
| 2 | `kalderashield.com` resolves and serves the site | **Not met.** No A record. |
| 3 | Code signing policy on the home page and download page | **Met in the repository**; live once gate 2 is met. |

### Gate 1 — why it is not optional

From <https://signpath.org/terms.html>:

> **Released:** The project must already be released in the form that should be
> signed.

No partial-credit version of this clause. Sending the application before a Windows
artifact exists would be rejected on the first read.

### Gate 2 — why it matters

Their terms require the code signing policy on "the project's home page". A domain
that does not resolve reads as a project that has not shipped.

## Form values

The form is a HubSpot form whose labels change over time. Match each value below
to whichever live field asks for it.

### Project / repository URL

```
https://github.com/hafgit99/kalderashield
```

### Licence

```
Apache License 2.0 (Apache-2.0). The full text is in the LICENSE file at the
repository root. Every component is under an OSI-approved licence (MIT, Apache-2.0,
MPL-2.0, ISC, BSD, Zlib); there is no GPL, AGPL or proprietary component, and no
commercial dual-licensing anywhere in the tree. The third-party inventory is
LICENSE-3RD-PARTY.md.
```

### Download / release URL

```
https://github.com/hafgit99/kalderashield/releases
```

Once the site is live, `https://kalderashield.com/download/` also works as the
project page.

### Project description

Under the 300-character limit:

```
KalderaShield is an offline-first, zero-knowledge password manager (Tauri 2, Rust,
React) for Windows, Linux, macOS, Android and browser extensions. We publish
Windows installers (setup.exe, MSI, portable .exe) on GitHub Releases, built from
the public repository by GitHub Actions. Apache-2.0, no accounts, no servers.
```

### Contact email

```
security@kalderashield.com
```

Communication after submission is by email. If `security@` is not monitored yet,
set that up before sending — a foundation that gets no reply stops replying.

## Reputation

The weakest part of the application, and pretending otherwise would be the worst
way to lose it. From their terms:

> For executable programs that may be downloaded and executed based on our
> signature, we require a certain verifiable reputation.

and

> we cannot sign binaries based on source code that nobody knows.

Measured on 2026-10-07, before the unsigned preview:

| Signal | Value |
| --- | --- |
| Stars | 6 |
| Forks | 0 |
| Contributors outside the maintainer | 0 |
| Total downloads across all releases | 55 |
| Releases | 3 |
| OpenSSF Scorecard | 7.5 |
| OpenSSF Best Practices | all six sections met (project 14390) |
| CI tests | 30 of 30 merged PRs checked |

What is genuine is the engineering record: 2243 unit tests, 37 fuzz tests, 91.1%
line coverage, mutation testing, CodeQL on every commit, SBOMs and sigstore
signatures on every release, a published threat model, and a fail-closed signing
gate that makes it impossible to ship an unsigned desktop build from a normal tag.

One thing that reads as a liability and is not: the Trend Micro quarantine of the
unsigned build, reported and since resolved
([fp-evidence §9](fp-evidence-kalderashield-7.0.18.0.md)). It is evidence that the
project engages with vendors and publishes verifiable evidence rather than
arguing. The document states plainly what the resolution does not cover — other
vendors may still score the binaries, and the files are still unsigned — which is
the kind of thing that makes the rest of the document believable.

## Checkboxes

- Required — "I have read and agree to the SignPath Foundation Code of Conduct."
- Required — "I agree to allow SignPath to store and process my personal data."
- Optional — "I agree to receive other communications from SignPath." Your choice.

## If rejected

Two things worth sending, in this order:

1. **If the blocker was the single approver.** Their terms name it explicitly
   ("trusted by the entire team"), and answering it before being asked is more
   credible. A second Approver has to actually exist first; naming someone who has
   not agreed to it would be worse than the original gap.
2. **If the blocker was anything else.** State the missing fact and do not argue
   the interpretation. Their terms say they "generally do not discuss policy", and
   the reputation paragraph is theirs to decide.

## After approval

1. Create the project in SignPath and connect the GitHub repository.
2. Configure a signing policy per their "Artifact configuration" requirements:
   product-name and product-version metadata set and enforced through file
   metadata restrictions. For this project: `KalderaShield` as the product name,
   the release version as the product version, matching `productName` and
   `version` in `src-tauri/tauri.conf.json`.
3. **Delete `.github/workflows/windows-unsigned-preview.yml`.** It fails by design
   once signing secrets exist, but leaving it in the repository invites the wrong
   conclusion about what the project's signing story is.
4. Add the SignPath step to `release-desktop.yml`, SHA-pinned, replacing the
   `WINDOWS_SIGNING_CERT_BASE64` path. SignPath holds the key in its HSM; this
   project never receives it.
5. Tag a release and confirm the `.exe` and `.msi` show a valid Authenticode
   signature.
6. Update the code signing policy **before** announcing the signed release. It
   currently says "not yet applied" and "it is not signed", and both become false
   the moment a signed build ships.
7. Update the download page and the Windows platform page, which will say a
   signed release exists.
8. The preview release can then be deleted from the releases page, or left in
   place as a record of the period before signing. Leaving it is more honest.
