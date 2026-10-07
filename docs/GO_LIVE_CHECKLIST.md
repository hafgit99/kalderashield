# Go-live checklist — kalderashield.com

The last step. Everything here assumes the unsigned Windows preview has been
published and pushed — see [WINDOWS_UNSIGNED_RELEASE_PLAN.md](WINDOWS_UNSIGNED_RELEASE_PLAN.md).

The order matters: DNS first, because the certificate cannot be issued before the
host resolves, and the certificate second, because a site serving over plain HTTP
is a worse first impression than a site that is not up yet.

## Current state

| Check | State |
| --- | --- |
| NS records | Set — Cloudflare (`aria`, `frank`) |
| MX record | Set — `mail.kalderashield.com`, mail is live |
| A/AAAA record | **Missing.** `kalderashield.com` does not resolve. |
| TLS certificate | None for the web host |
| nginx vhost | Not written |

The mail side is finished and passing mail-tester 10/10. Only the web host is
outstanding.

## 1. DNS

Add at the registrar or in Cloudflare:

```
A     kalderashield.com      <VPS_IP>
A     www.kalderashield.com  <VPS_IP>
```

AAAA only if the VPS has a working IPv6 address and nginx listens on it. An AAAA
pointing at an address nothing listens on makes roughly half of all visitors fail
before TLS starts, and the symptom looks like an intermittent outage.

Wait for propagation, then confirm from outside:

```powershell
Resolve-DnsName kalderashield.com
Resolve-DnsName www.kalderashield.com
Invoke-WebRequest -Uri http://kalderashield.com -UseBasicParsing
```

The last one should return an nginx response. If it times out, the firewall is
still closed on port 80 — fix that before touching certificates, because
Let's Encrypt's HTTP-01 challenge needs it.

## 2. nginx

The repository does not contain a vhost template; `UYGULAMA_PLANI.md` §3.1 lists
writing one as outstanding work. Minimum viable:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name kalderashield.com www.kalderashield.com;
    root /var/www/kalderashield;
    index index.html;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        try_files $uri $uri/ =404;
    }

    # Redirect everything else to HTTPS once the certificate is in place.
    location / {
        return 301 https://kalderashield.com$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name kalderashield.com www.kalderashield.com;
    root /var/www/kalderashield;
    index index.html;

    ssl_certificate     /etc/letsencrypt/live/kalderashield.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kalderashield.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options DENY always;
    add_header Cross-Origin-Opener-Policy same-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;

    # COEP and CORP are needed by the WebExtension build's SharedArrayBuffer path.
    # If they break an asset, scope them rather than dropping them.
    add_header Cross-Origin-Embedder-Policy require-corp always;
    add_header Cross-Origin-Resource-Policy same-origin always;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location / {
        try_files $uri $uri/ =404;
    }

    # Hashed assets under /assets are immutable by name; the HTML that references
    # them is not. Caching them hard is the single cheapest performance win.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Two of those headers need a decision rather than a copy:

- **COEP/COOP/CORP** are what let the extension build use
  `SharedArrayBuffer`. They also block cross-origin resources, and the site loads
  none. If a page breaks, check these first.
- **A Content-Security-Policy** is deliberately absent from the template. Writing
  one by hand for a site with twelve inline JSON-LD blocks and an inline theme
  script is guesswork. Generate it once the site is live, by running the browser's
  CSP report-only mode against real pages, rather than shipping a guessed policy
  that breaks the site.

`www` is listed in `server_name` but no redirect from `www` to the apex is
specified. Decide now and make it a real redirect — every canonical URL on the site
points at the apex, so a `www` that serves duplicate content is a canonical
problem, not just a preference.

## 3. Certificate

```bash
certbot certonly --webroot -w /var/www/certbot -d kalderashield.com -d www.kalderashield.com
```

Then reload nginx and check the renewal timer:

```bash
certbot renew --dry-run
systemctl status certbot.timer
```

## 4. Deploy the tree

```bash
rsync -av --delete kalderashield-website/ root@<VPS>:/var/www/kalderashield/
```

`--delete` matters. The locale trees are generated, and a stale file left behind
by an earlier deploy is a page that no longer exists still being served.

The directory must contain `index.html` at the root and the locale directories
alongside it. Serving `kalderashield-website/` as the parent would 404 on
everything.

## 5. Verify, in this order

The first four are the ones whose failure a visitor would notice:

- [ ] `https://kalderashield.com` returns 200 over TLS.
- [ ] `https://www.kalderashield.com` redirects to the apex.
- [ ] `https://kalderashield.com/download/` — the Windows card shows the unsigned
      preview warning.
- [ ] `https://kalderashield.com/code-signing-policy.html` — the policy page, and
      the phrase "Free code signing provided by SignPath.io, certificate by
      SignPath Foundation" is present. This is the page a SignPath reviewer opens.
- [ ] `https://kalderashield.com/.well-known/security.txt` — `Contact:` resolves
      to a real mailbox.
- [ ] `https://kalderashield.com/sitemap.xml` — 288 addresses.
- [ ] `https://kalderashield.com/robots.txt` — the sitemap line is there.
- [ ] Spot-check four locales: `/en/`, `/ja/`, `/ru/`, `/ar/` — all render, and
      `ar` is `dir="rtl"`.
- [ ] `http://kalderashield.com` redirects to HTTPS.

## 6. Locally, before deploying

The gates that must pass. `audit-i18n` currently fails on pre-existing findings,
so read the count rather than expecting zero:

```bash
cd kalderashield-website
node scripts/check-placeholders.cjs          # must PASS
node scripts/audit-page-meta.cjs            # must be clean
node scripts/audit-locale-links.cjs         # must PASS
node scripts/audit-static-i18n.cjs          # must PASS
node scripts/check-signing-copy-agreement.cjs  # must PASS
node scripts/check-policy-strays.cjs        # must be clean
node scripts/audit-i18n.cjs                 # baseline was 34; investigate anything above
```

`audit-static-i18n.cjs` is the one that fails if a page's static text disagrees
with its dictionary — the check that keeps the served page from depending on
JavaScript running at all.

The last two are new and exist because of what this work uncovered:
`check-signing-copy-agreement.cjs` because three pages had already disagreed about
Windows signing once, and `check-policy-strays.cjs` because a machine-generated
translation put English words inside Japanese and Arabic sentences and every
existing check passed.

## 7. After it is up

- [ ] Submit `https://kalderashield.com/sitemap.xml` to Search Console and Bing
      Webmaster Tools.
- [ ] Confirm `security@kalderashield.com` receives mail from outside. The
      SignPath application will be answered by email.
- [ ] Update the GitHub repository homepage field to
      `https://kalderashield.com` — it is already set to this, but verify it
      survived the rebrand.
- [ ] Delete the AegisVault announcement consideration from your notes, or make the
      decision. `UYGULAMA_PLANI.md` lists it as open.

## What not to do

- **Do not submit the SignPath application on day one.** Their terms need the
  preview release to have been out for a while, and the site's download page is
  what they read. Let it run.
- **Do not delete the preview release** when signing arrives. Leaving it is more
  honest than removing the record of the period before signing, and it costs
  nothing.
- **Do not remove the fail-closed signing gate** when the preview ships. It is the
  gate that makes the project look like something worth signing.
