---
title: python — kör riktig kod i sandbox (Pyodide/WASM)
status: later
tags: [apps, wasm]
updated: 2026-07-17
---

## Mål
`python script.py` kör riktig Python i webbläsaren via Pyodide (WASM), mot en fil
i VFS:en. "Riktig liten dator" på allvar — kod som faktiskt exekverar.

## Research
- **Hög insats, högt värde.** Pyodide är ett tungt WASM-paket; måste ligga bakom
  dynamic import (som `supabase-js`) så basbundlen inte betalar för det. Ladda
  först vid första `python`.
- Stark portfolio-signal: WASM + sandboxad exekvering imponerar och är on-brand
  (lärande, "riktig dator"). Men det är det dyraste drömmålet — märk det som
  sådant.
- VFS-brygga: Pyodide har eget FS. Behöver mappa läs/skriv mot vår VFS så
  `python` ser filerna man skapat i terminalen, och stdout landar i vår utskrift
  (komponerbar i pipes).
- Idiom: `python script.py` är rakt av äkta. Ingen divergens.

## CSP-blockeraren + iframe-vägen (spikat 2026-07-18)
En spik visade: Pyodide **kör** (Python 3.14, sum=5050) men kräver `unsafe-inline`
i CSP (flera varierande inline-script-hashar) — **oförenligt med huvudappens
strikta CSP**. Direkt-i-huvudsidan är alltså dött.

**Lösningen: sandboxad iframe.** Kör Pyodide i en egen sida (`/python-sandbox.html`)
på PIA:s **egen origin** med en *egen, lösare* CSP (`wasm-unsafe-eval` etc.) — utan
att röra huvudappens CSP. Terminalen ↔ iframe via `postMessage`.

**Krävs (allt byggbart, inga nya tredjeparts­tjänster):**
1. `/python-sandbox.html` med lös CSP för WASM/eval.
2. Huvud-CSP: lägg till `frame-src 'self'`.
3. **Själv-hosta Pyodide** (~10–25 MB statiska filer från npm-paketet `pyodide`,
   kopieras till `dist/`) — annars laddar den från jsdelivr-CDN → CSP `connect-src`
   blockerar. (Alternativ: vitlista CDN i iframens CSP, men tappar self-contained.)
4. `postMessage`-brygga (skicka kod, strömma stdout/stderr).
5. `python`-kommando (REPL + kör `.py` från VFS).

## Öppna frågor
- Bara köra en fil, eller även REPL (`python` utan arg)?
- Micropip/paket-ekosystem? Börja utan.
- Bundle-storlek: lazy-ladda Pyodide bara vid första `python`.

_Ligger i `later` — tyngsta drömmålet, men iframe-vägen är nu spikad och
byggbar. Bra att ta **efter** paket-omgången._
