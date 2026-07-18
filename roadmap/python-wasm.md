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

## Öppna frågor
- Bara köra en fil, eller även REPL (`python` utan arg)?
- Hur mycket av paket-ekosystemet exponeras (micropip)? Börja utan.
- CSP: WASM kräver rätt `script-src`/`wasm-unsafe-eval` — verifiera mot vår
  strikta policy i riktig browser innan vi lovar något.
- Värt insatsen före lättare drömmål (CRT-mode)? Troligen efter.

_Ligger i `later` — det tyngsta drömmålet. Befordra först när kärnan känns klar._
