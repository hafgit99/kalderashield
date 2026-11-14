# Update & Distribution Plan (unsigned-capable channels)

This document defines how KalderaShield reaches users on Windows and Android
while no operating-system code-signing certificate is available, and how the
release pipeline must change to make that possible without weakening the
integrity guarantee the updater already provides.

It is a companion to `docs/RELEASE_PLAN.md`, not a replacement: that document
still owns the release gates and the artifact checklist. This one owns the
*distribution channels* — what a user on each platform is offered, and how the
pipeline is allowed to produce it.

## 0. How to enable it

There are two sources for the two settings, and they are read in this order:
**the repository variable wins when it is set, otherwise the committed file is
used.**

### 0.1 The committed file (the default, and what this repository ships)

`release/release-config.json`:

```json
{
  "desktopPlatforms": "windows",
  "allowUnsignedPlatforms": "windows"
}
```

* `desktopPlatforms` — which desktop platforms to build. `linux` is always
  built and cannot be deselected; naming `windows` on its own is how a release
  ships without macOS/Windows certificates.
* `allowUnsignedPlatforms` — which platforms may be published **without** an
  operating-system code signature. Empty means none.

The file is versioned and reviewable: the declaration that permits an
unsigned artifact is part of the diff that produced it, not a setting that
lives outside the repository.

### 0.2 The repository variables (the operational override)

Settings → **Secrets and variables** → **Actions** → **Variables** tab → *New
repository variable*:

| Variable | Overrides |
|---|---|
| `RELEASE_DESKTOP_PLATFORMS` | `desktopPlatforms` |
| `ALLOW_UNSIGNED_PLATFORMS` | `allowUnsignedPlatforms` |

Set a variable to `none` to disable the file's declaration for one release
without editing the file.

The variables are an override, not a requirement: some accounts do not show
the Variables tab at all, and the release must not depend on a settings page
being reachable.

### 0.3 What the current configuration produces

With the shipped file and no certificates:

```
selection=linux,windows
windows-signing=unsigned
macos-signing=skipped
unsigned-platforms=windows
```

Linux and Windows are published, the Windows artifacts carry no Authenticode
signature, and macOS is not built at all. The release is blocked (before
anything is built) if a selected platform has neither a certificate nor a
declaration — for example after adding `macos` to `desktopPlatforms` without
a certificate.

---

## 1. The problem, stated precisely

The weekly routine in GitHub Actions (Dependabot pull requests, the CodeQL
scan on Mondays, the Scorecard scan on Tuesdays) produces **findings and
pull requests**. It does not publish anything. A release happens only when a
`v*` tag is pushed (`/.github/workflows/release-desktop.yml`).

Measured state as of v7.0.24 (published 2026-10-14):

| Fact | Evidence |
|---|---|
| The last published release is a month old | GitHub Releases API: `v7.0.24`, published 2026-10-14 |
| The published release contains no Windows or macOS artifact | its asset list has Linux packages, APKs, extensions, SBOMs, `latest.json` |
| Windows exists only as a separate prerelease | `v7.0.24-unsigned-preview` (prerelease = true) |
| The updater manifest contains only Linux entries | `latest.json` → `platforms: { linux-x86_64, x86_64-unknown-linux-gnu }` |
| Every download URL in that manifest is a 404 | `.../download/v7.0.24.0/...AppImage` → **404**; `.../download/v7.0.24/...AppImage` → **200** |

The fourth and fifth rows are the actual bug, and they are two separate bugs:

1. **The tag was reconstructed from the package version.**
   `package.json` carries a 4-part version (`7.0.24.0`, the Android
   versionCode scheme) and the release workflow accepts the trimmed tag
   (`v7.0.24`). The manifest generator built the tag as `v${version}` →
   `v7.0.24.0`, a release that does not exist. The manifest itself was served
   correctly, so nothing failed loudly; only the payload download failed.
   *Fixed in M1.*

2. **Windows and Android have no entry in the manifest.**
   A Windows client reads the manifest, finds no `windows-x86_64*` key, and
   concludes it is up to date. It never learns a newer version exists. The same
   is true for macOS.

Until both are fixed, "the app is a month behind" is not a habit — it is the
pipeline working exactly as written.

---

## 2. What the updater can and cannot do

Established from the pinned sources, not from assumption:

| Question | Answer | Source |
|---|---|---|
| Which platforms does the Tauri updater support? | Windows, Linux, macOS. **Not Android, not iOS.** | `tauri-plugin-updater-2.14.0/src/lib.rs:7`; `updater_os()` returns `None` on Android → `Error::UnsupportedOs` |
| What happens with several endpoints? | The **first endpoint that answers 2XX wins**. A manifest that lacks the running platform does *not* fall through to the next endpoint — it fails with `TargetNotFound`. | `tauri-plugin-updater-2.14.0/src/updater.rs:545-652`; Tauri docs: "Tauri will only continue to the next url if a non-2XX status code is returned" |
| Which key does a Windows client look up? | `windows-x86_64-nsis` (or `windows-x86_64-msi`) first, then `windows-x86_64`. The installer type is detected from the *installed* product, so an MSI install and an NSIS install look up different keys. | `updater.rs:743-773` |
| What is the Windows update payload in Tauri v2? | The NSIS installer itself: `KalderaShield_<v>_x64-setup.exe` + `KalderaShield_<v>_x64-setup.exe.sig` | Tauri docs, "Building" → `createUpdaterArtifacts: true` |
| What is the macOS payload? | `KalderaShield.app.tar.gz` + `.sig` | same |
| What is the Linux payload? | The AppImage + `.sig` | same |
| What does the `.sig` protect against? | The payload is verified with the minisign public key in `src-tauri/tauri.conf.json`. **This is independent of Authenticode.** | Tauri updater design |
| How is the update installed on Windows? | `installMode: passive` (default): a progress bar, no user interaction. The app exits automatically before installation. | Tauri docs; `updater.rs:1058-1110` |

### The consequence that decides the architecture

Because the first 2XX manifest wins and there is no per-platform fallback, a
"separate unsigned manifest" **cannot** be used as a second endpoint. One
release must therefore publish **one manifest containing every platform it
serves**, and the trust distinction has to be expressed *inside* that manifest
rather than by which URL served it.

This is also why the integrity story survives the absence of Authenticode:
the Tauri minisign signature on the payload is verified against a key that
only this project holds, on every client, before a byte is installed. What is
missing without a certificate is *publisher identity at the operating-system
level* — Windows SmartScreen and macOS Gatekeeper — not payload authenticity.

---

## 3. Target architecture

```
                         ┌──────────────────────────┐
  GitHub Release tag v*  │  latest.json  (ONE file) │
  ─────────────────────► │  platforms: {            │
                         │    linux-x86_64,         │
                         │    windows-x86_64-nsis,  │
                         │    windows-x86_64-msi,   │
                         │    darwin-*              │
                         │  }                      │
                         │  unsigned_platforms: []  │  ← machine-readable declaration
                         └──────────────────────────┘
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
        Tauri updater (Win/Linux/macOS)          Android update module
        check() → banner → download → verify      Rust fetch → compare version
        → install                                 → banner → open APK in browser
```

### 3.1 Desktop: one manifest, declared-unsigned platforms

* `latest.json` is the single source of truth and lists every platform the
  release serves, including the ones whose installer carries no OS signature.
* A top-level `unsigned_platforms` array names the platforms in that manifest
  whose payload is **not** OS-code-signed. The Tauri updater ignores unknown
  top-level fields (serde does not use `deny_unknown_fields` on
  `RemoteRelease`), so the field is safe to add and is read by our own client
  to render an "unsigned build" notice in the update banner.
* The release notes carry the same declaration in prose, and the checksum
  manifest lists every published file, so a user can verify the payload by
  hand without trusting the app.

### 3.2 Android: notify + install, outside the Tauri updater

Android cannot use the Tauri updater at all (§2). The distribution channel is:

1. The release publishes `android-latest.json` next to the APK:
   `{ version, versionCode, publishedAt, notes, apk: { url, sha256, size } }`.
2. The app reads that file **from Rust** (`fetch_android_update_manifest`) and
   compares the announced version with the installed one, then shows the
   existing update banner when the remote value is newer.

   The read cannot happen in the webview: `github.com` answers with a redirect
   to `release-assets.githubusercontent.com`, which sends no
   `Access-Control-Allow-Origin` header, so every `fetch` rejects as "Failed to
   fetch" no matter what the CSP allows. The command follows redirects only to
   the release hosts and verifies TLS against roots compiled into the binary --
   on Android the platform verifier needs a Kotlin component and a JNI
   hand-off that this app does not have, so it would fail every request.
   Because the webview no longer reads the file, `connect-src` carries no
   GitHub origin at all.
3. The banner's action opens the APK URL in the system browser. The user
   downloads and confirms the install; Android performs an **in-place update**
   because the APK is signed with the same release keystore and the
   `versionCode` is higher.

This is the standard flow for a sideloaded app outside the Play Store. The
user must have allowed "install from unknown sources" once; Play Protect may
show a warning about an app that is not from the Store.

### 3.3 macOS: notify + download (deliberately not auto-install)

An un-notarized `.app` cannot be launched without a manual override
("Gatekeeper"), so an auto-updater would replace the working app with one the
user cannot open. macOS therefore stays a **notify + download** channel:
the update banner points at the release page with the exact
`xattr -dr com.apple.quarantine` / right-click→Open instructions. The
installer is still published with a minisign signature so the payload can be
verified, but the app does not attempt a silent swap.

---

## 4. Policy: "declared unsigned" instead of "no unsigned"

The pipeline today refuses to publish an unsigned Windows or macOS artifact
(`desktop:release:signing:report --require-signed`, the Y-19 gate). That gate
is correct for what it protects and it must not be deleted. It has to be
*scoped*, because today its only other effect is that **no Windows user can
receive an update at all**.

The new rule, in full:

1. An unsigned artifact may be published **only** for a platform named in the
   repository variable `vars.ALLOW_UNSIGNED_PLATFORMS` (e.g. `windows`).
2. An unsigned artifact may be published **only** if the generated manifest
   lists that platform in `unsigned_platforms`, and the release notes say so
   in prose.
3. The gate **still fails** when an artifact on a platform that is *not*
   declared unsigned is unsigned. Declaring `windows` does not permit an
   unsigned macOS build.
4. The variable is unset by default, so the default behaviour of the pipeline
   is unchanged: a release without an explicit declaration publishes nothing
   unsigned.

The integrity guarantee that Y-19 exists to protect — that a user cannot be
handed an artifact whose origin is unverified — is preserved by the minisign
signature, which is present on every updater payload regardless of the OS
code-signing state. What the declaration makes visible, rather than hidden,
is the thing Y-19 cannot provide: publisher identity to the operating system.

---

## 5. Milestones

### M1 — Fix the manifest tag (done)

* `scripts/generate-updater-manifest.cjs`: resolve the release tag from
  `RELEASE_TAG` / `GITHUB_REF_NAME`, falling back to the package version with
  its trailing `.0` trimmed. Never reconstruct `v${version}` blindly.
* `.github/workflows/release-desktop.yml`: pass `RELEASE_TAG: ${{ github.ref_name }}`
  to the generator step.
* `scripts/generate-updater-manifest.test.mjs`: two tests — the URL is built
  from the release tag, and the local fallback trims the trailing `.0`.

Effect: the Linux updater stops offering a 404 and starts working.

### M2 — Windows in the main release, declared unsigned (done)

* `scripts/select-release-platforms.cjs`: also decide the *signing mode* per
  platform (`signed` / `unsigned` / `skipped` / `blocked`) from
  `vars.ALLOW_UNSIGNED_PLATFORMS` (or the committed `release/release-config.json`)
  and the availability of each certificate. A selected platform with neither a
  certificate nor a declaration is `blocked`, and the plan job fails before
  anything is built.
* `scripts/desktop-signing-report.cjs`: new `--allow-unsigned-platforms`
  flag. Declared platforms are recorded as `UNSIGNED (declared)` in the
  evidence file; undeclared ones still fail.
* `.github/workflows/_reusable-desktop-build.yml`: new `signing-mode` and
  `allow-unsigned-platforms` inputs. In `unsigned` mode the certificate
  import and the Authenticode step are skipped — the minisign signature
  (`TAURI_SIGNING_PRIVATE_KEY`) is still applied, so the updater payload stays
  verifiable.
* `.github/workflows/release-desktop.yml`: the plan job detects which
  certificates exist (an emptiness test on a secret, never a print of it), the
  build jobs receive the signing mode, the publish job re-verifies with the
  same declaration, and the alias step stages
  `KalderaShield-latest-windows-x64-setup.exe` and
  `KalderaShield-latest-windows-x64.msi` with their signatures beside them.
* `scripts/generate-updater-manifest.cjs`: emit the Windows platform keys
  (`windows-x86_64-nsis`, `windows-x86_64`, `windows-x86_64-msi`) and the
  `unsigned_platforms` array.
* App side: `src/lib/updater.ts` reads `unsigned_platforms` from the manifest
  and reports it, and the settings card and the banner state it in words
  before the user starts an install.

Effect: a Windows user gets the "new version available" banner and installs
it in-app, with the payload verified by minisign.

### M3 — Android notify + install (done)

* New `scripts/generate-android-update-manifest.cjs` → `android-latest.json`
  (version, optional `versionCode`, notes, APK URL, SHA-256, size). The
  release publishes it next to `latest.json`; the file name is version-less,
  so `releases/latest/download/android-latest.json` resolves to the newest
  non-prerelease release — the same release the desktop updater is offered by.
* The Android build job records the `versionCode` the Tauri CLI generated, so
  the publish job can publish it without re-deriving it.
* New `src/lib/androidUpdate.ts`: compares the announced version with the
  running one, and opens the APK download through the native bridge.
* New `src-tauri/src/android_update.rs`: the manifest read itself, exposed to
  the page as `fetch_android_update_manifest`. It is the only way to read the
  file — see §3.2 — and it keeps the webview off the release hosts entirely.
* New `AndroidUpdateBridge.kt`: opens an HTTPS URL on an allowlisted host with
  an `ACTION_VIEW` Intent. The Tauri `opener` plugin was **not** used: its
  underlying `open` crate resolves URLs through `xdg-open`, which does not
  exist on Android, and it would have pulled a D-Bus dependency tree into the
  mobile build for a single Intent.
* `src/hooks/useAutoUpdateCheck.ts` and `src/hooks/useAppUpdater.ts`: the
  Android branch of the same two hooks, so the check-on-start and the settings
  card work there too.
* i18n for all twelve locales.

### M4 — macOS unsigned build + download page (not started, deliberately)

macOS is out of scope for this round. An un-notarized `.app` cannot be
launched without a manual override, so an auto-updater would replace the
working app with one the user cannot open. macOS therefore stays a notify +
download channel with Gatekeeper instructions on the download page.

### M5 — Website / release page (not started)

* Stable aliases for every platform (`KalderaShield-latest-*`).
* The download page states, per platform, whether the artifact is
  OS-code-signed, and shows the SHA-256 and the minisign public key.

### M6 — Release 7.0.25.0 (not started)

* Merge `fix/ci-test-count-and-zip-advisories` (contains the
  `rustls-webpki` / `webpki-root-certs` / `tokio` / `ctutils` advisory fix,
  currently unreleased) into `main`.
* Version bump: `package.json` → `7.0.25.0`, `src-tauri/tauri.conf.json` →
  `7.0.25`, `Cargo.toml`/`Cargo.lock` matched, Android `versionCode` bumped.
  Verify with `npm run desktop:release:version:check` and
  `npm run android:release:version:check`.
* Website version references updated (the previous release commits did this).
* `npm run desktop:release:gate`, evidence + completed manual smoke checklist.
* The unsigned declaration is already in `release/release-config.json`; check
  it still says what this release should do.
* Tag `v7.0.25` → `release-desktop.yml`.

---

## 6. Verification matrix

| Check | How | Gate |
|---|---|---|
| Manifest URLs resolve | fetch every `platforms[*].url` from the published `latest.json` | manual, before announcing the release |
| Manifest declares unsigned platforms | `unsigned_platforms` matches `vars.ALLOW_UNSIGNED_PLATFORMS` | CI |
| The manifest's URLs are not 404s | `RELEASE_TAG` reaches the generator; the published URL answers 200 | CI + manual |
| Windows client finds an update | install the NSIS build, run "Check for Updates" | manual smoke checklist |
| Payload integrity | Tauri verifies the minisign signature against `tauri.conf.json` `pubkey` | built into the client |
| Android finds an update | install the APK, check the banner | manual smoke checklist |
| Android update is in-place | install the new APK over the old one; Android accepts it (same keystore, higher `versionCode`) | manual smoke checklist |
| No unsigned artifact without a declaration | `desktop:release:signing:report --allow-unsigned-platforms <list>` fails on an undeclared unsigned artifact | CI |
| Payload/payload-signature pairing | `node scripts/verify-signature-payloads.cjs --dir release-local/windows` | CI |

---

## 7. Honest limitations

These are properties of the distribution channel, not bugs to be fixed later:

* **SmartScreen.** An unsigned Windows installer downloaded by hand shows
  "Windows protected your PC". The user must click *More info → Run anyway*.
  The in-app update path does not set the Mark-of-the-Web, so it is usually
  smoother than a manual download — but the installer itself is still unsigned,
  and Defender may still warn.
* **Portable installs.** A user running the portable `.exe` has no registered
  installer, so the updater cannot determine the bundle type and cannot offer
  an update. Those users must download manually.
* **MSI vs NSIS.** The updater picks the payload key from the installed
  product, so an MSI install is offered the MSI and an NSIS install the NSIS.
  Switching installer family by hand is not an update.
* **Android.** The user approves the install; Play Protect may warn about an
  app that does not come from the Store; the update cannot be silent.
* **macOS.** Gatekeeper requires a manual override for every update until the
  build is notarized.
* **No silent security updates.** Once a release is published, its payload URL
  is immutable. A payload that must be withdrawn cannot be un-advertised
  through the manifest; it needs a new release.

---

## 8. Rollback

* The manifest is regenerated per release. A bad manifest is fixed by
  publishing a new release, not by editing the old one.
* `vars.ALLOW_UNSIGNED_PLATFORMS` can be unset at any time; the next release
  then refuses to publish unsigned artifacts, exactly as today.
* The `unsigned_platforms` field is informational for the client; a client
  that does not understand it keeps working.
