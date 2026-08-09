---
title: publish → ~/public_html (tilde-URL:er, index, RSS)
status: now
tags: [share, web]
updated: 2026-08-09
---

## Mål
Lyfta `publish` (levererad, se `publish-folder`) från "en mapp landar i mottagarens
`~/incoming/`" till en riktig **läs-vy för omvärlden** — men på **Unix-vis**, inte
som en bloggmotor limmad på sidan. Det djupa idiomet finns redan: allt under
**`~/public_html/`** serveras på `http://host/~user/` (Apache `mod_userdir`,
"tilde-URL:er"). Att *publicera* är att skriva en fil dit — inte att köra ett verb
som returnerar en magisk URL. Terminalen blir en enkel CMS för det du redan skriver
i `nano`, on-brand: du äger domänen och skrivytan, det här *visar upp* filerna.

## Research
- **Var vi står:** `publish <mapp>` packar filerna self-contained i en `#p=`-hash
  och materialiserar dem i mottagarens *egen* session (`~/incoming/`), läst med
  `glow`/`cat`. Ingen server, funkar för guests. Det är en **dela-med-en-person**-
  vy, inte en **publicera-för-världen**-vy — den här pucken är det senare.
- **Omtaget — mekaniken var fel, inte målet.** Tidigare skiss ville ha en "garden"
  med en egen slug-route (`/g/<slug>`) och ett CMS-index. Problemet: webbprodukt
  utan Unix-rot, drar bort från "terminal-idiom first". Rätt fråga är "vad är
  Unix-sättet att göra filer publika". Svaret: **`~/public_html`**. Divergensen är
  inte att `publish` finns — den är att dagens mentala modell ("app som ger en
  base64-URL") missar idiomet filsystemet redan uttrycker.
- **Vad tilde-idiomet löser gratis:** ren URL härledd ur sökvägen
  (`…/~torbjorn/solresor`, stabil för att platsen är stabil); `index.md` *är*
  hemsidan, annars **directory listing** (autoindex, Unix default); publicerings-
  verbet försvinner mest (`nano ~/public_html/x.md`, `ls ~/public_html` = "live");
  RSS blir en **genererad fil**, ett `make`/build-steg, inte en framework-feature.
- **Städar upp verb-röran** (var verb får ett rent idiom):
  - `share <fil>` → efemär, en-till-en, serverlös `#p=`/`#s=`-hash (det den är).
  - `share <fil> <email>` → en *namngiven* person, moln + roller (viewer/editor),
    RLS-skyddat. "Bara den här personen ser det." (Se `shared-file-roles`.)
  - `~/public_html` → publik-för-världen, stabil URL, kräver inloggning + server.
- **Tre avsikter, tre mekanismer** — gränsen mot `share`/`shared`:

  | Vill du… | Verktyg | Vem kan läsa |
  |---|---|---|
  | Publikt för världen | `~/public_html` *(denna puck)* | alla, stabil URL |
  | Bara en namngiven person | `share <fil> <email> [--ro]` | just den inbjudna |
  | Vem som råkar få länken | `share <fil>` → `#s=`-hash | alla med den (olistad) |

## Föreslaget serverval (kärnvalet — nu spikat till förslag)
Backat av kodläsning: hela filsystemet lagras redan som **en privat `jsonb`-rad per
användare** i tabellen `filesystems` (RLS, ägar-låst — se `supabase/storage.ts`).
Det formar valen:

- **Lagring — materialiserad publik projektion, INTE läsning ur den privata raden.**
  Ny tabell `public_pages(owner, handle, path, content, html, updated_at)`. Vid
  `publish` **kopieras** filerna från `~/public_html/` dit. Att servera direkt ur
  `filesystems`-blobben (även via en SECURITY DEFINER-RPC som "bara plockar ut
  public_html") betyder att en enda bugg läcker *hela* det privata filsystemet. En
  separat tabell är **defense-in-depth**: den innehåller per konstruktion bara det
  publika. Ger dessutom ren avpublicering (radera raden), plats för förrenderad
  HTML + `feed.xml`, och **32 KB-taket försvinner** (innehåll i rad, inte i URL).
  RLS: `select` öppet för anon, `insert/update/delete` bara ägaren.
- **Compute/route — Cloudflare Pages Function, inte Worker, inte Supabase Edge.**
  En Function i samma repo (`functions/`) fångar `/~*`, slår upp `public_pages`,
  svarar. Samma domän (`pia.tor2dbear.com/~…` faller ut direkt — Supabase Edge ger
  fel domän och dödar "ren URL"), samma deploy, samma CSP-disciplin som `dist/`.
- **Rendering — materialisera vid publish, håll servern dum.** Klienten renderar
  md→HTML vid `publish` (återanvänd/utöka `glow`-renderaren) och skriver källa +
  HTML till raden. Functionen blir en tunn uppslagning: matcha `/~user/slug` →
  hämta rad → returnera lagrad HTML + headers + cache. Ingen md-motor server-side;
  CSP-säkert och cache-bart vid edge.

## Användarnamn / handle (nytt — krävs för `~user`)
Kodläsning: dagens username är bara **mjuk metadata** (`user_metadata.username`),
inte unik/validerad/reserverad — duger för prompten, inte för en publik namnrymd.
(Så `tor2dbear` sattes bara som metadata via `useradd`/`rename`.)

- **En identitet, inte två.** På Unix *är* login-namnet din `~namn`. Håll det
  ihop — ingen separat "publiceringshandle".
- **Ingen grind vid signup — claim lat vid första `publish`.** CLAUDE.md:
  "signup stays frictionless"; `verify` är byggt på exakt det mönstret. Username
  förblir mjuk metadata tills du först publicerar; *då* måste det bli ett unikt,
  reserverat handle. Den som aldrig publicerar behöver aldrig ett unikt namn.
- **Förifyllt, inte tyst slumpat.** Vid första publish: härled kandidat ur
  nuvarande username (slugifierat). Ledigt → erbjud det (en knapptryckning bort).
  Upptaget → säg det + föreslå alternativ, be om annat. Bekräfta → reservera
  atomiskt. Ett `~user7f3a` vore fult för en publik URL.
- **Backning — en riktig `handles`-tabell** (`handle text primary key`,
  `user_id uuid unique`). Jsonb-metadata kan inte ha unik constraint. Claim =
  `insert` (krock → upptaget); byte = `update` i transaktion.
- **Regler:** `[a-z0-9]` + enkla bindestreck, 2–39 tecken, inget led-/släp-bindestreck,
  case-insensitivt (lagras gement). **Reserverad-ord-denylist** måste täcka allt
  routen använder: `api`, `www`, `incoming`, `public`, `feed`, `assets`, …
- **Byte:** tillåtet (`rename` finns), GitHub-stil — gamla `/~gammalt/`-URL:er
  bryts. Frigör gammalt handle efter cooldown så det inte kan kapas direkt.

## User stories
- **US 1 — blogga från terminalen.** `nano ~/public_html/2026-solresor.md` →
  nås på `…/~torbjorn/2026-solresor`, `index.md` som omslag, autoindex annars.
- **US 2 — dela en enskild fil som en ren länk.** Lägg i `~/public_html/` (eller
  `publish note.md` som kopierar dit) → kort, ren URL vem som helst kan läsa.
- **US 3 — ett flöde att prenumerera på.** `~/public_html/` exponerar en genererad
  `feed.xml` att följa i en RSS-läsare.

## Slice-plan
- **Slice A — namnrymd + serverad läs-vy (MVP).** `handles`-tabell + lat claim vid
  första `publish`; `public_pages`-tabell + RLS; `publish` kopierar `~/public_html/`
  → projektion och skriver ut `…/~user/…`-URL:en; Pages Function serverar `/~*`
  (index.md/enskild fil) med förrenderad HTML. Inloggad; platt mapp; ingen RSS.
- **Slice B — autoindex + RSS.** Directory listing när `index.md` saknas; genererad
  `feed.xml`; ev. `.nolisting` per mapp.
- **Slice C — puts.** Tema/typografi, OG-taggar per sida, ev. undermappar/assets.

## Öppna frågor (kvar att bekräfta)
- Autoindex på som default eller bara när `index.md` saknas? Avstängbar per mapp?
- Bygg-steget för `feed.xml`/HTML vid publish (write-hook) — bekräfta att det
  förblir litet + CSP-säkert.
- Idiom-flagga att notera i CLAUDE.md när Slice A landar: vi *serverar*
  `~/public_html` som en riktig webbserver (mod_userdir, rent Unix) + `publish`-
  verbet blir bekvämlighet ovanpå en filsystem-plats.

_Befordrad till `now` 2026-08-09: serverval + handle-modell spikade till förslag.
Bygget startar på Slice A._
