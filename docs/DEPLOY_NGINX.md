# Deploy notes — nginx + Next.js (hotel.sisgesc.net)

## Symptom

- Desktop: pages load **without CSS** (unstyled HTML).
- Mobile: `Application error: a client-side exception has occurred while loading hotel.sisgesc.net`.

## Root cause observed

`GET /_next/static/css/<hash>.css` returned **HTTP 400** from the edge (nginx → Next), while JS under `/_next/static/chunks/` returned 200. Unstyled UI + stale year-long HTML cache (`s-maxage=31536000`) after deploys causes client crashes on phones.

Common nginx mistake: a regex location for `*.css` / `*.js` that steals `/_next/static/css/*` before the Next proxy / alias:

```nginx
# BAD — steals Next CSS away from the app
location ~* \.(css|js)$ {
  root /var/www/html;
}
```

## Required nginx snippet

Prefer an exclusive prefix for Next static assets:

```nginx
location ^~ /_next/static/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  # Or serve files directly:
  # alias /var/www/hotelaria/.next/static/;
  # access_log off;
  # expires 1y;
  # add_header Cache-Control "public, immutable";
}

location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Host $host;
}
```

If you keep a global `location ~* \.(css|js)$`, it must **not** win over `/_next` — use `^~` on `/_next/static/` as above.

## App-side mitigations (already in repo)

1. `experimental.inlineCss` — CSS embedded in HTML `<style>` tags.
2. `public/hotelaria-app.css` — copied on `npm run build` as a stable fallback URL + inlined via `CriticalCss`.
3. Document `Cache-Control: no-store` so stale HTML after deploy does not pin broken chunk hashes.
4. next-intl **server** `getMessageFallback` / `onError` in `src/i18n/request.ts` (never pass functions into `NextIntlClientProvider` — that crashes the client with “Application error”).
5. `error.tsx` / `global-error.tsx` recovery UI.

## After each deploy

```bash
npm ci
npm run build
# restart PM2 / systemd unit pointing at `next start` or standalone server
sudo nginx -t && sudo systemctl reload nginx
```

Verify:

```bash
curl -sI https://hotel.sisgesc.net/hotelaria-app.css | head
curl -sI https://hotel.sisgesc.net/_next/static/css/$(curl -s https://hotel.sisgesc.net/ | grep -oE '_next/static/css/[^"]+' | head -1 | cut -d/ -f4) | head
```

Expect **200** and `content-type: text/css` for both when nginx is correct. With current app mitigations, the UI still styles via inline + `/hotelaria-app.css` even if the hashed `/_next/static/css` path remains broken.
