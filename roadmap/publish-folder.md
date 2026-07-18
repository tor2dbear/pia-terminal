---
title: publish — mappar blir en publik sida
status: done
tags: [share, web]
updated: 2026-07-18
---

## Mål
`publish <mapp>` gör `.md`-filerna i en mapp till en liten publik, statisk sida
med egen URL. En läs-vy för omvärlden, byggd av det du redan skrivit i
terminalen.

## Levererat
- **`publish <mapp>`** samlar mappens `.md`-filer (toppnivå), packar dem
  self-contained i URL:en och skriver ut en länk `…#p=<payload>`. `index.md` /
  `README.md` läggs först, resten alfabetiskt.
- **Öppnar man en `#p=`- (eller `#s=`-) länk landar innehållet i *din egen*
  session** — inte i en främmande sandlåda. `main.ts` bootar den vanliga
  terminalen (inloggad om du är det, annars guest) och materialiserar det delade
  i **`~/incoming/`** (mapp → `~/incoming/<namn>/`, ensam fil → `~/incoming/`),
  **i minnet** (inget sparas). En banner + auto-`cd`/`ls` visar filerna direkt.
  Mottagaren **behåller det den vill med `cp`** — att bara öppna en länk skriver
  aldrig tyst till kontot. `share` och `publish` delar nu exakt denna väg
  (`pia/incoming.ts`), så beteendet är synkat.
- **Återanvänder `glow`/`cat`** för att läsa markdown istället för en egen
  renderare. Ny liten motor-metod `Terminal.exec(line)` kör ett kommando
  programmatiskt (auto-`ls` vid boot; även användbar i tester).

## Beslut på öppna frågor
- **Var bor det:** hash-URL, precis som `share <fil>` — self-contained, ingen
  server, funkar för guests. (Supabase-rad / Cloudflare-funktion valdes bort.)
- **Hur visas det:** som en **prompt** i din egen session. Innehållet blir riktiga
  filer i `~/incoming/` som du kan `cat`/`glow`/`nano`/`cp`. *(Reviderat två
  gånger: v1 var en renderad HTML-sida; v2 en efemär sandlåda; v3 — detta —
  landar i din egen session så du kan **behålla** det, vilket var poängen.)*
- **Spara automatiskt?** Nej (val "B"): landar i minnet, du behåller med `cp`. Att
  tjuvkika smutsar inte ner kontot; det matchar ändå `~/shared/`-mönstret för
  e-post-delning, fast utan tyst skrivning.
- **Login eller guest:** din session — inloggad behåller i molnet, guest lokalt.
- **Storleksgräns:** `MAX_PUBLISH_PAYLOAD` = 32 KB. Web-divergensen (`publish` →
  URL) stod redan som accepterad i CLAUDE.md.

## Levererat (forts.)
- **`share <mapp>`** funkar nu också — `share` tar fil *eller* mapp, `publish`
  finns kvar som eget kommando, och båda bygger exakt samma `#p=`-länk via en
  delad `folderLink`-helper. En delad mapp tar med **alla** toppnivå-filer (inte
  bara `.md`), eftersom viewern nu är ett filsystem-drop där `cat`/`glow` läser
  vad som helst. `share <mapp> <email>` avvisas (sam-redigering är per fil).
  *(Vi valde bort alias — inga `scp`/`shar`/`tar`-alias; deras arg-grammatik
  krockar. `share`/`publish` är rena verb med korrekt beteende.)*

## Ev. följd (ej gjort, valfritt)
- Rekursiv mapp (undermappar med), och bilder/assets (idag bara text i hashen).
