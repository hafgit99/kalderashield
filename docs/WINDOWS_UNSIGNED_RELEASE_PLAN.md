# Plan — unsigned Windows preview, then the site, then SignPath later

The order of operations, and why it is this order. Three steps, and the second one
depends on the first.

## Where this stands

- **Done.** The Trend Micro false positive that quarantined the unsigned build was
  reported and has since stopped. Recorded in
  [fp-evidence-kalderashield-7.0.18.0.md](fp-evidence-kalderashield-7.0.18.0.md)
  §9–10, including what that resolution does *not* cover.
- **Done.** The code signing policy exists in the repository
  ([CODE_SIGNING_POLICY.md](../CODE_SIGNING_POLICY.md)) and on the site in twelve
  languages.
- **Done.** A workflow that publishes an unsigned Windows preview as a
  pre-release: `.github/workflows/windows-unsigned-preview.yml`.
- **Not done.** No Windows artifact has been published yet.
- **Not done.** `kalderashield.com` does not resolve — NS and MX records are set,
  but there is no A record, so the site is unreachable.
- **Deferred.** The SignPath Foundation application, deliberately, until after the
  preview is out and the site is live.

## Step 1 — publish the unsigned Windows preview

### Run it

**Actions → Windows unsigned preview release → Run workflow.**

- `version`: `7.0.21` (the tag becomes `v7.0.21-unsigned-preview`)
- `dry_run`: leave **on** for the first run

The dry run builds everything, runs the gates, asserts the binaries are unsigned,
checks `SHA256SUMS.txt` covers them, and stops before creating the release. Read
the log. If the artifact list looks wrong, fix it here rather than after
publishing.

Second run: `dry_run` off. It creates the release as a **pre-release**.

### What it will not do

- It will not run if release signing is configured. There is an explicit check at
  the top that fails the job, because publishing an unsigned preview once a
  certificate exists is exactly the confusion this file is meant to prevent.
- It will not be triggered by a tag. `workflow_dispatch` only.
- It will not touch the fail-closed gate in `release-desktop.yml`. A normal version
  tag still fails on an unsigned artifact.
- It will not move `latest`.

### Verify after publishing

```
gh release view v7.0.21-unsigned-preview --json tagName,isPrerelease,isLatest
gh release view --json tagName,isPrerelease,isLatest     # latest must be v7.0.20
```

Then check by hand:

- [ ] The release shows as a pre-release in the GitHub UI.
- [ ] The release notes open with the unsigned warning, above the changelog.
- [ ] `SHA256SUMS.txt` is attached and lists every `.exe` and `.msi`.
- [ ] Download one artifact and confirm its SHA-256 matches the published line.
- [ ] `latest` still resolves to a signed release.

### Before running it at all

- [ ] Complete the Windows manual smoke checklist in
      [DESKTOP_MANUAL_SMOKE_CHECKLIST.md](DESKTOP_MANUAL_SMOKE_CHECKLIST.md) for
      these artifacts, with the tester field filled in.
      [PUBLIC_RELEASE_BLOCKERS.md](PUBLIC_RELEASE_BLOCKERS.md) blocks Windows
      distribution on this, and the signoff should not be skipped because the
      files are unsigned. The difference between a preview and a release is the
      signature, not the testing.

## Step 2 — bring the site live

The site is last on purpose. Its content is already written, but it currently
describes a Windows state that is about to change, and every line of it would need
rewriting if it went out first and then got replaced by the preview.

Order within this step:

1. Commit and push the Step 1 outcome, so the repository the site describes is
   true.
2. Point the domain at the VPS (see
   [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md) for the DNS and server side).
3. Update the site copy for the preview (Step 3 below) — the Windows card, the
   platform page, the FAQ.
4. Regenerate and deploy.

## Step 3 — what on the site has to change when the preview ships

Three places currently say Windows is not published. All three are in
`kalderashield-website/`, and all three have dictionaries to update as well:

| File | Change |
| --- | --- |
| `download/index.html` | The Windows card. `win-store-title` / `win-store-desc` already say the application is in progress; they now also need to say an unsigned preview exists. |
| `content/pages/13-windows.json` | `secBody` says no Authenticode signature and no release. Add the preview. |
| `kalderashield-website/assets/js/i18n/*.json` | Whatever the two above change, in twelve languages. |

The pattern for doing this is the one the repository already uses: a one-shot
script under `scripts/` that writes the keys into all twelve dictionaries, kept in
the tree. See `apply-signpath-policy-status-i18n.cjs` for the shape of one.

The rule that matters: **the release notes, the download page and the code signing
policy must all say the same thing.** They were briefly inconsistent once already,
which is why the code signing policy page now carries an explicit "updated before,
not after, the first signed release" commitment.

## Step 4 — SignPath, later

Not now. The application values are prepared in
[SIGNPATH_APPLICATION_2026.md](SIGNPATH_APPLICATION_2026.md) and can be pasted into
the form whenever it is sent.

Two things make "later" a reasonable position rather than a postponement:

- Their terms require a released Windows artifact. After Step 1 that condition is
  met, so the application becomes possible whenever it is sent.
- Their terms also require the code signing policy on the project's home page.
  After Step 2 that is true. Sending it before either would be sending it
  incomplete.

When it does go in, the reputation question will be the hard part, and the
preview's download count is the main thing that will have moved.

## If the preview is a mistake

The release can be deleted. Nothing else has to be undone: no version was
consumed, `latest` never pointed at it, and the tag is suffixed so it is
distinguishable in a clone. This is the property the `-unsigned-preview` suffix
and the pre-release flag exist to provide, and it is worth remembering when
deciding whether to go ahead, because it is the difference between a reversible
step and an irreversible one.

## The one thing that does not reverse

Anything a user does with the files. A user who downloads, gets a SmartScreen
warning, clicks through, and then gets a different antivirus product's quarantine
has had that experience. This is the cost of the step, stated plainly so it is not
discovered later as a surprise.
