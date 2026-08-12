---
title: python i prod — sandbox-CSP tappas av Cloudflare clean-URL
status: now
tags: [wasm, deploy, bugfix]
updated: 2026-08-12
---

## Mål
`python` (Pyodide) fungerar lokalt men **hänger tyst i produktion** på
`pia.tor2dbear.com` — man kan `brew install python` men inte köra något. Fixa så
det kör i prod, och så att ett framtida fel *syns* istället för att hänga.

## Rotorsak (verifierad mot live-prod 2026-08-12)
1. Bryggan laddar sandbox-iframen från **`/python-sandbox.html`**.
2. Cloudflare Pages "clean URLs" gör en **308-redirect** `/python-sandbox.html`
   → **`/python-sandbox`** (strippar `.html`).
3. Den looser CSP:n (som ger Pyodide `wasm-unsafe-eval` + `worker-src blob:`)
   emitteras i `dist/_headers` **bara för `/python-sandbox.html`**. `_headers`
   matchar den *serverade* sökvägen → `/python-sandbox` matchar inte → faller
   igenom till `/*` = **appens strikta CSP** (ingen `wasm-unsafe-eval`).
4. Pyodide får inte kompilera sin WASM → `loadPyodide()` kastar inuti iframen.
5. Sandboxens message-handler saknade `.catch`, och bryggan saknade timeout → 
   inget svar postas tillbaka → **`python` hänger för evigt utan felmeddelande**.

Verifierat live: `curl` visar `/pyodide/*.js/.wasm` = 200 (assets finns), men
`/python-sandbox.html` → 308 → `/python-sandbox` serveras med den **strikta**
CSP:n (`script-src 'self' https://static.cloudflareinsights.com`, ingen
`wasm-unsafe-eval`).

## Fix
- **(A) `_headers`: emittera regeln även för `/python-sandbox`** (utan `.html`),
  identisk looser CSP + `X-Frame-Options: SAMEORIGIN`, i `vite.config.ts`. Då får
  den redirectade sökvägen rätt policy. (`.html`-regeln behålls för dev/preview
  och ifall Cloudflare någon gång serverar `.html` direkt.)
- **(B) Sandboxen postar tillbaka ett fel** om Pyodide-init misslyckas
  (`public/python-sandbox.js` — `.catch` runt körningen, nollställ
  `pyodidePromise` så nästa `python` gör ett nytt försök).
- **(C) Bryggan får en timeout** (`bridge.ts`) på iframe-uppstarten och
  nollställer `ready`/`frame` vid fel så nästa körning kan återförsöka — så en
  framtida regression *syns* som ett fel istället för en tyst hang.

## Verifiering
- Lokalt: `npm run build` → `dist/_headers` innehåller `/python-sandbox`-regeln.
- WASM/redirect kan **inte** reproduceras i vitest/`vite preview` (bara
  Cloudflare gör 308:an) → slutverifiering mot **PR-previewens** Cloudflare-URL:
  `curl` att `/python-sandbox` nu har looser CSP, och kör `python -c` i headless
  Chromium mot previewen.

## Öppna frågor
- Alternativ till (A): peka iframen på `/python-sandbox` (utan `.html`) och
  slippa redirecten — men det bryter `vite dev`/`preview` där filen bara finns
  som `/python-sandbox.html`. Header-fixen är därför den robusta vägen.
