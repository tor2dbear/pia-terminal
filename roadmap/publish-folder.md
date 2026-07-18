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
  `README.md` läggs först (som en statisk sajts startsida), resten alfabetiskt.
- **Öppnar man en `#p=`-länk renderas en läs-vy istället för terminalen** —
  `main.ts` returnerar tidigt, ingen shell/storage/auth (guests kan se den).
  Sidan har rubrik (mappnamnet), en innehållsförteckning när det finns fler än en
  fil, och varje `.md` som en sektion.
- **Egen md→HTML-renderare** (`pia/markdownHtml.ts`): rubriker, listor, kod,
  citat, länkar, emfas. Den befintliga `markdown.ts` ritar terminalrader; en
  publik sida vill ha HTML — så det här är HTML-syskonet. **Säker:** all källtext
  escapas innan egna taggar läggs till, och länkar begränsas till säkra protokoll
  (javascript:/data: renderas som text). Verifierat med tester + boot-check i
  riktig Chromium under strikt CSP, utan injektion.

## Beslut på öppna frågor
- **Var bor sidan:** hash-URL, precis som `share <fil>` — self-contained, ingen
  server, funkar för guests. (Alternativen Supabase-rad / Cloudflare-funktion
  valdes bort: mer infra, kräver login.)
- **En sida vs flersidig:** en scrollbar sida (index + sektioner).
- **Login eller guest:** guest — hashen bär allt, ingen inloggning behövs.
- **Storleksgräns:** `MAX_PUBLISH_PAYLOAD` = 32 KB (mot `share`s 4 KB); över det
  ett tydligt fel med uppmaning att publicera mindre. Web-divergensen (`publish`
  → URL) stod redan som accepterad i CLAUDE.md.

## Ev. följd (ej gjort, valfritt)
- Flersidig sajt (index + undersida per fil med routing i viewern), om lusten
  finns — nu renderas allt på en sida.
- Rekursiv mapp (undermappar med), och bilder/assets (idag bara toppnivå-`.md`,
  ingen binärdata i hashen).
