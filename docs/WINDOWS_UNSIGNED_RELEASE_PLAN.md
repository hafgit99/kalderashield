# Plan — site first, then the unsigned Windows preview, then SignPath

The order of operations. The site comes first this time, which is not the order
this document originally proposed, and the reason it changed is worth recording.

## Why the order changed

The first version of this plan had a workflow publish the unsigned preview, and
the site follow it. That workflow would have needed `contents: write` and the
ability to create a GitHub Release, and
`scripts/security-release-signing-gate.cjs` exists to close exactly that route:

> An entry [in the exceptions table] is a claim that the workflow cannot turn an
> unsigned build into a published one. That claim is verified below rather than
> trusted.

The gate verified it and refused. Adding the exception would have made the gate
pass, but it would also have made its closing line untrue — *"without the signing
secrets configured, a public desktop release remains impossible by design"* — and
the exception would have been added by an assistant reacting to a failing check
rather than by a maintainer deciding it.

So the build stays where the gate already permits it to be. The judgment about
publishing happens in a browser, by a person, with the gate untouched.

## Step 1 — bring the site live

The site is first because its content already describes the Windows position, and
every page of it would need rewriting if the preview shipped first. Full
instructions in [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md).

Short version: add an A record, write the nginx vhost, get the certificate,
`rsync` the tree, verify ten URLs.

The repository should be committed and pushed first, so the site describes a
repository that is true.

## Step 2 — build the Windows artifacts

Two routes. The CI one is preferred: it builds on a clean runner, so nothing from
a previous version can leak in.

**From GitHub Actions:**

1. Actions → **Windows unsigned build** → Run workflow.
2. When it finishes, download the `kalderashield-windows-unsigned` artifact.
3. Unpack it somewhere.

That workflow has `contents: read` and cannot publish. That is the point of it.

**Locally:**

```bash
Remove-Item -Recurse -Force release-local    # Windows PowerShell
npm run release:local:skip-tests
```

The `Remove-Item` is not optional. `release-local` is not emptied between
versions, and `npm run windows:preview:package` refuses to stage a directory
holding a different version's binaries — see "The check that will probably fire"
below.

## Step 3 — stage for manual upload

```bash
npm run windows:preview:package
```

Point it at the unpacked artifact if you built in CI:

```bash
npm run windows:preview:package -- C:\Users\you\Downloads\kalderashield-windows-unsigned
```

It writes `release-preview/windows/` containing the binaries, a fresh
`SHA256SUMS.txt`, and `RELEASE-NOTES.md`, then prints the tag, the title and the
eight steps of the GitHub form.

It does not touch GitHub. It cannot.

### The check that will probably fire

The first run is likely to be refused:

```
  package.json version : 7.0.20
  release tag would be : v7.0.20-unsigned-preview
  [DIFF] 7.0.19.0
           KalderaShield-7.0.19.0-windows-x64-setup.exe
           ...
```

That is the stale-directory case, and it is the one that matters. A release tagged
`v7.0.20` carrying 7.0.19 installers claims a provenance the bytes do not have,
and `SHA256SUMS.txt` would checksum them happily, which makes it *look* verified.
Clean `release-local` and rebuild.

If you genuinely mean to release the older build, say so explicitly:

```bash
npm run windows:preview:package -- 7.0.19.0
```

The tag is then derived from the bytes rather than from `package.json`.

The script also refuses to stage fewer than three binaries. The installer, the MSI
and the portable executable are three ways to install the same application, and a
user who comes for one and finds nothing has been failed for no reason.

## Step 4 — publish it

In the GitHub Releases form, exactly as the script prints:

1. Releases → **Draft a new release**
2. Tag `v7.0.20-unsigned-preview` — type it, do not pick an existing one, and do
   not let GitHub default to `main`.
3. Target: the commit the artifacts were built from.
4. Title: `KalderaShield 7.0.20 for Windows (unsigned preview)`
5. Paste `RELEASE-NOTES.md` as the description.
6. Drag every file from `release-preview/windows/` in.
7. **Set "Set as a pre-release" ON.** This is the step that keeps `latest`
   pointing at the signed releases. It is the only one that cannot be checked
   afterwards, so check it before clicking Publish.
8. Publish.

Verify:

```bash
gh release view v7.0.20-unsigned-preview --json tagName,isPrerelease,isLatest
gh release view --json tagName      # must NOT be the preview
```

Then download one artifact and confirm its SHA-256 matches the published line.

## Step 5 — update the site's copy

The site currently describes the preview as forthcoming. Once it exists, three
places change, and all three have twelve languages:

| File | Script to run |
| --- | --- |
| `download/index.html` | `scripts/apply-windows-preview-download-i18n.cjs` |
| `content/pages/13-windows.json` | `scripts/apply-windows-preview-platform-i18n.cjs` then `build-pages.cjs` then `scripts/apply-windows-preview-platform-keys.cjs` |
| `assets/js/i18n/*.json` | the two above write all twelve |

Then:

```bash
cd kalderashield-website
node scripts/generate-locales.cjs
node scripts/check-signing-copy-agreement.cjs
```

Those scripts are written and were run when the copy was prepared. They state the
preview as existing, so **they must only be run after step 4**, not before.

`check-signing-copy-agreement.cjs` is the one that matters. The download card, the
code signing policy and the Windows platform page have each said something
different about Windows signing at some point, and on one occasion the download
page said the packages were coming to the Microsoft Store while the policy page
described a SignPath application. Both were reachable from the navigation. That
check compares six specific facts across all three and fails if they disagree.

## Step 6 — SignPath, when it is ready

Prepared in [SIGNPATH_APPLICATION_2026.md](SIGNPATH_APPLICATION_2026.md). Nothing
has been submitted.

Their terms require two things this plan produces: a released Windows artifact,
and the code signing policy on the home page. Both are true after steps 1 and 4.

## Before step 4 — the things that are not optional

- [ ] **Windows manual smoke checklist** in
      [DESKTOP_MANUAL_SMOKE_CHECKLIST.md](DESKTOP_MANUAL_SMOKE_CHECKLIST.md),
      complete for these exact artifacts, tester field filled in.
      [PUBLIC_RELEASE_BLOCKERS.md](PUBLIC_RELEASE_BLOCKERS.md) blocks Windows
      distribution on this. The difference between a preview and a release is the
      signature, not the testing.
- [ ] **The site is live.** The release notes tell users the policy is published at
      `kalderashield.com/code-signing-policy.html`. If the site is not up, that is
      a link to nowhere in a document whose purpose is to be credible.
- [ ] **The repository is pushed.** The release notes name this repository as the
      source of the artifacts.

## If it is a mistake

The release can be deleted, and the tag with it. Nothing else has to be undone: no
version was consumed, `latest` never pointed at it, and the `-unsigned-preview`
suffix means the tag is distinguishable in a clone. That reversibility is the
property the suffix and the pre-release flag exist to provide.

The one thing that does not reverse is anything a user did with the files. Someone
who downloads, gets the SmartScreen warning, clicks through, and then hits a
different antivirus product's quarantine has had that experience. That is the cost
of the step, stated here so it is not discovered later.
