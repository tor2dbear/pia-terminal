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
- **Öppnar man en `#p=`-länk bootar en read-only PIA-terminal med mappen
  monterad** — inte en renderad webbsida. En banner förklarar ("published folder:
  … · throwaway sandbox — nothing is saved"), `ls` körs automatiskt så filerna
  syns direkt, och mottagaren utforskar med `cat`/`glow`/`cd`. En delad länk *är*
  en liten dator man petar på — samma idiom som `share <fil>` (som redan visar
  innehåll i terminalen). Sessionen är efemär (fräsch VFS, `MemoryStorageAdapter`,
  fake auth), så inget mottagaren gör läcker tillbaka till publiceraren.
- **Återanvänder `glow`** för markdown-rendering istället för en egen renderare —
  den terminal-native vägen behöver ingen bespoke md→HTML. Ny liten motor-metod
  `Terminal.exec(line)` kör ett kommando programmatiskt (auto-`ls` vid boot; även
  användbar i tester).

## Beslut på öppna frågor
- **Var bor sidan:** hash-URL, precis som `share <fil>` — self-contained, ingen
  server, funkar för guests. (Supabase-rad / Cloudflare-funktion valdes bort: mer
  infra, kräver login.)
- **Hur visas den:** som en **prompt** (read-only terminal med mappen monterad) —
  inte en renderad webbsida. Detta gör `share` och `publish` konsekventa (båda
  terminal-native) och är mer on-brand än en commodity-webbsida. *(Reviderat: den
  första versionen var en renderad HTML-sida; togs bort till förmån för prompten.)*
- **Login eller guest:** guest — hashen bär allt, ingen inloggning behövs.
- **Storleksgräns:** `MAX_PUBLISH_PAYLOAD` = 32 KB (mot `share`s 4 KB); över det
  ett tydligt fel. Web-divergensen (`publish` → URL) stod redan som accepterad i
  CLAUDE.md.

## Ev. följd (ej gjort, valfritt)
- Montera i en namngiven undermapp (`~/<mapp>/`) och `cd` dit vid boot, istället
  för löst i `~`.
- Rekursiv mapp (undermappar med), och bilder/assets (idag bara toppnivå-`.md`,
  ingen binärdata i hashen).
- Ev. göra `share <fil>`-länken lika standalone som publish (idag previewar den i
  din egen session).
