---
title: publish → ~/public_html (tilde-URL:er, index, RSS)
status: inbox
tags: [share, web]
updated: 2026-08-09
---

## Mål
(Research, inte beslutat.) Lyfta `publish` (levererad, se `publish-folder`) från
"en mapp landar i mottagarens `~/incoming/`" till en riktig **läs-vy för
omvärlden** — men göra det på **Unix-vis**, inte som en bloggmotor limmad på
sidan. Det djupa idiomet finns redan: allt under **`~/public_html/`** serveras på
`http://host/~user/` (Apache `mod_userdir`, "tilde-URL:er"). Att *publicera* är
att skriva en fil dit — inte att köra ett verb som returnerar en magisk URL.
Terminalen blir en enkel CMS för det du redan skriver i `nano`, on-brand: du äger
domänen och skrivytan, det här *visar upp* filerna.

## Research
- **Var vi står:** `publish <mapp>` packar filerna self-contained i en
  `#p=`-hash och materialiserar dem i mottagarens *egen* session (`~/incoming/`),
  läst med `glow`/`cat`. Ingen server, funkar för guests. Det är en **dela-med-
  en-person**-vy, inte en **publicera-för-världen**-vy — den här pucken är det
  senare, ett steg *bredvid* det som redan finns.
- **Omtaget — mekaniken var fel, inte målet.** Tidigare skiss ville ha en "garden"
  med en egen slug-route (`/g/<slug>`) och ett CMS-liknande index. Problemet: det
  är en webbprodukt utan Unix-rot, och drar projektet bort från "terminal-idiom
  first". Rätt fråga är inte "hur bygger vi en blogg" utan "vad är Unix-sättet att
  göra filer publika för världen". Svaret är **`~/public_html`**. Divergensen är
  inte att `publish` finns — den är att dagens mentala modell ("app som ger en
  base64-URL") missar idiomet filsystemet redan uttrycker.
- **Vad tilde-idiomet löser gratis, på Unix-vis:**
  - **Ren URL** — härledd ur sökvägen, inte en slug-tabell:
    `pia.tor2dbear.com/~torbjorn/solresor`. Stabil för att platsen är stabil.
  - **Index/omslag** — `index.md` (eller `index.html`) *är* hemsidan; saknas den
    faller det tillbaka på **directory listing** (autoindex). Det är Unix default,
    inte ett nytt CMS-koncept.
  - **Publicerings-verbet** — försvinner mest. Du publicerar med
    `nano ~/public_html/x.md`, `cp`, `mv`. `ls ~/public_html` visar vad som är
    live. Filsystemet *är* gränssnittet.
  - **RSS-flöde** — en genererad fil, idiomatiskt ett `make`/build-steg, inte en
    framework-feature.
- **Vad `publish`-kommandot blir** (två ärliga vägar):
  1. **Pensioneras som verb** — publicering är `cp`/`mv`/`nano` in i
     `~/public_html/`. Maximalt Unix: inget nytt verb för något filsystemet redan
     uttrycker.
  2. **Blir en tunn status/hjälpare** — `publish` utan arg skriver ut din publika
     bas-URL och vad som ligger under den (i praktiken snyggt `ls ~/public_html` +
     URL-mappning). Ett ärligt kommando, inte en fejkad webb-app.
  - *Lutning:* **hybrid** — behåll `publish <mapp>` som bekvämlighet som kopierar
    in i `~/public_html/` och skriver ut URL:en, men gör platsen och mekaniken
    **synlig** så det inte är magi. Då kan man också publicera "för hand" och
    förstå exakt vad som händer.
- **Städar upp verb-röran.** Var verb får ett rent idiom istället för tre
  nästan-lika:
  - `share <fil>` → efemär, en-till-en, serverlös `#p=`-hash (det den redan är).
  - `~/public_html` → publik-för-världen, stabil URL, kräver inloggning + server.
- **Renderaren finns till hälften:** `glow`/`cat` läser redan markdown i
  terminalen; en publik HTML-vy behöver en egen (minimal) md→HTML + tema. Håll den
  liten och CSP-säker (samma disciplin som resten av `dist/`).

## User stories
- **US 1 — blogga från terminalen.**
  *Som* person som vill skriva publikt *vill jag* skriva markdown i `nano` under
  `~/public_html/` *så att* terminalen är min CMS.
  `nano ~/public_html/2026-solresor.md` → nås på `…/~torbjorn/2026-solresor`, med
  `index.md` som omslag och directory listing när det saknas.
- **US 2 — dela en enskild fil som en ren länk.**
  *Som* någon som snabbt vill dela en anteckning *vill jag* lägga den i
  `~/public_html/` (eller köra `publish note.md` som kopierar dit) *så att* jag får
  en kort, ren URL att klistra in — läsbar av vem som helst utan att de förstår
  PIA. (Snabbaste vägen till att *andra* rör vid PIA, en krok tillbaka till
  kontoskapande.)
- **US 3 — ett flöde att prenumerera på.**
  *Som* återkommande läsare *vill jag* att `~/public_html/` exponerar en
  `feed.xml` (genererad, inte handskriven) *så att* jag kan följa den i en
  RSS-läsare.

## Öppna frågor
- **Servervalet är det enda som blockerar** (och det är oundvikligt här): tilde-
  URL:er kräver en route som mappar `/~user/*` till lagrade filer — en Cloudflare
  Pages Function / Worker + en Supabase-rad per publik fil, med RLS som gräns
  (samma mönster som `ai-mcp-context` landade i). Serverlöst `#p=` räcker inte för
  en stabil publik URL. **Spika detta innan bygge.**
- Guest vs inloggad: en stabil `/~user/`-URL kräver rimligen ett användarnamn →
  inloggning. Guests behåller `share`/`#p=` (efemärt). Bekräfta gränsdragningen.
- Directory listing: på som default (Unix `autoindex`), eller bara när `index.md`
  saknas? Och vill vi kunna stänga av den per mapp (à la `.nolisting`)?
- Bygg-steget för `feed.xml`/HTML: genereras vid publicering (write-hook) eller
  on-the-fly i Workern? Håll det litet och CSP-säkert oavsett.
- Idiom-flagga: att vi *serverar* `~/public_html` som en riktig webbserver gör är
  en lätt-försvarad web-divergens (mod_userdir är rent Unix). Notera den i
  CLAUDE.md när valet är fattat, tillsammans med att `publish`-verbet blir
  bekvämlighet ovanpå en filsystem-plats.

_Ligger i `inbox` tills servervalet (tilde-route + lagring) är fattat. Befordra
till `next/later` då._
