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

## Paketering: `brew install python` (spikat 2026-07-18)
Python exponeras som ett brew-paket — `brew install python` — men är ett
**accepterat "tjockt paket"**, inte rent frikopplat som `cal`/`bc`/`fortune`.

**Varför brew:**
- On-brand (`brew install python` är precis äkta homebrew).
- **Opt-in-grinden är själva poängen:** Pyodide är ~10–25 MB — får aldrig ligga
  i basbundlen. Utan install → `unknown command`, som övriga paket. Sätter också
  förväntan ("laddar en stor runtime").
- Kommando-sömmen räcker: `python` är en vanlig `Command` som pratar med iframen
  via `postMessage` — en lazy-chunk som alla andra paket.

**Varför det inte är ett *rent* paket:** till skillnad från `cal` kräver det två
saker som bor i **kärnan**, inte i paketmappen:
1. Sandbox-sidan (`/python-sandbox.html`) — statisk route med egen lösare CSP.
2. `frame-src 'self'` i huvud-CSP:n.
Båda är billiga/harmlösa när python *inte* är installerat (pytteliten HTML som
aldrig laddas + ett CSP-direktiv utan effekt utan iframe). Det dyra —
Pyodide-WASM:en — förblir äkta lazy: iframen hämtar den först vid första
`python`-körningen.

**Beslut:** special-casa python, **generalisera inte `Package`-interfacet** för
N=1. Katalograden registrerar `python`-kommandot (lazy bridge-klient);
sandbox-sida + CSP är kärn-infra. Dyker ett andra tungt sandbox-paket upp senare
→ generalisera då. Var ärlig i pucken: accepterat "tjockt paket" (samma anda som
share→URL-divergensen), inte en drift.

## Öppna frågor
- Bara köra en fil, eller även REPL (`python` utan arg)?
- Micropip/paket-ekosystem? Börja utan.
- Bundle-storlek: lazy-ladda Pyodide bara vid första `python`.

_Ligger i `later` — tyngsta drömmålet, men iframe-vägen är nu spikad och
byggbar. Paketeringen (brew, tjockt paket) är spikad. Bra att ta **efter**
paket-omgången (sl/cmatrix → tutor → life/tetris → qr)._
