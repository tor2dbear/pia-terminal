---
title: history-persistens — ~/.pia/history (HISTFILE) mellan sessioner
status: done
tags: [shell, terminal]
updated: 2026-07-30
---

## Mål
Pil-upp ska nå kommandon från *tidigare* sessioner, precis som en riktig terminal
(bash `HISTFILE`). Uppföljning på `history`-kommandot (`history-command.md`), som
byggde listnings-halvan men medvetet sköt upp persistensen: history var bara
in-session och försvann vid reload.

## Levererat (2026-07-30)
- **Fil:** `~/.pia/history`, HISTFILE-idiomet, i samma `.pia/`-dotfil som resten
  av konfigen. Lever i VFS-trädet, så den syncar med allt annat när man är
  inloggad (samma fil på alla enheter) och sparas lokalt för gäster.
- **Motor-söm, inte PIA-logik i kärnan.** `Terminal` fick tre optionella hooks —
  `loadHistory` (seedar pil-upp vid boot), `saveHistory` (anropas efter varje
  kommando med hela listan) och `clearHistory` (`history -c` tömmer även filen).
  Alla utelämnade → ren in-minnes-history (som t.ex. adventure-exemplet). Fil-I/O
  ligger i `main.ts` bakom sömmen; hjälparna i `src/pia/history.ts` är rena.
- **`histappend`, inte overwrite.** `saveHistory` läser filen och appendar bara
  *nya* rader (per fönster räknat), skippar en rad som upprepar den föregående
  (`HISTCONTROL=ignoredups`) och kapar till `HISTSIZE` (1000, nyast vinner). Att
  appenda mot filen — inte skriva över från minnet — är det som låter två
  tmux-fönster dela en fil utan att klippa varandras rader.
- **Debouncad persist.** Varje kommando skriver history till VFS direkt, men
  `adapter.save` coalescas (~1.5 s) så en kommando-burst inte hamrar storage; en
  `beforeunload`-flush gör de sista raderna varaktiga om fliken stängs först.
- **Konto-byte:** `rehome()` läser om history från det nya kontots fil, så pil-upp
  följer med in-/utloggning (varje konto har sin egen `~/.pia/history`). Inget
  läcker mellan konton — varje kommando är redan flushat till filen.

## Härdat (Codex-rundor)
- **Inga hemligheter i history (HISTIGNORE).** `passwd`/`login`/`useradd`/`register`
  tar lösenordet som ett argument; hela raden hålls utanför history (både pil-upp
  och filen) via en `histIgnore`-söm på `Terminal`. Checken körs på de *resolvade*
  kommando-namnen — den går igenom pipeline-stegen vänster-till-höger, expanderar
  alias precis som körningen (inkl. alias-args), lär sig alias *definierade
  tidigare på samma rad* (`alias p passwd; p pw`), och rekurserar in i `at`:s
  payload (`at now+5m login u pw`, även via alias `later hunter2`). Så direkt,
  aliasad, kedjad och schemalagd variant fångas alla. `Terminal` äger parsningen;
  `main.ts` bidrar bara med namn-listan (`hasSecret`).
- **Konflikt-reconcile för bakgrunds-sparningen, delad över fönster.** Den
  debouncade sparningen gick först direkt mot `adapter.save` och svalde
  `StorageConflictError` → nästa spar kunde skriva över en samtidig moln-ändring.
  Nu går den genom `Terminal.flush()` → `persistTree()`-reconcilen (keep-both,
  stash under `~/.pia/conflicts/`). Eftersom alla fönster delar *ett* VFS finns
  **en enda delad pending-persist** (i `main.ts`), inte en timer per fönster —
  annars kunde ett konto­byte i fönster A missa fönster B:s väntande skrivning.
  Den flushas synkront vid livscykel-gränser via en injicerad `flushPending`:
  vid `dispose()`, av värden på `beforeunload`, och — viktigast — i **början av
  en konto-transition** (`withTransition` → `ctx.flushHistory`), *innan* auth
  byter identitet. Annars hade den uppskjutna sparningen routats genom fel konto
  (gäst-träd till moln-kontot vid login, användarens träd till gäst-localStorage
  vid logout). Sparningarna **serialiseras på en kedja** (aldrig två `flush()`
  samtidigt, som annars racade molnets base-version), och `flushPending` väntar
  in hela kedjan — inte bara en väntande timer — så en transition inte byter
  identitet mitt i en save som ännu inte hunnit landa.
- **Hemligheter, godtyckligt djupt.** Secret-checken rekurserar in i `at`:s
  payload med en budget = radens token-antal (som strikt minskar per nivå), så
  även absurt nästlade `at now+5m at now+5m … passwd pw` fångas — ingen godtycklig
  djup-cap som kan kringgås.

## Kända v1-begränsningar (medvetet dragen gräns)
Bara history är best-effort här — VFS-mutationer och konto­byten sparas fortfarande
synkront och reconcilas som förut. De kvarvarande kanterna gäller enbart *ren
läskommando-historik* (raderna som bara finns för pil-upp), och stänga dem kräver
en oproportionerlig retry-/omkö-mekanik för en portfolio-v1:
- **`beforeunload` mot molnet är best-effort.** localStorage (gäster +
  Hybrid-adapterns lokala hälft) hinner skriva under unload, men en läskommando-rad
  <1.5 s innan fliken hårt-stängs på ett moln-konto kan tappas — browsern väntar
  inte in det async nätverks-anropet. (Samma som att en hård-dödad bash tappar
  osparad history.)
- **Transient spar-fel retrias inte.** Ett icke-konflikt-fel (nätglapp) från en
  bakgrunds-`flush()` sväljs; de senaste läskommando-raderna ligger kvar i minnet
  och skrivs vid nästa spar, men går man reload/konto­byte dessförinnan tappas de.
  Konflikter (den farliga varianten) reconcilas dock alltid (keep-both).
- **History vid en samtidig-enhet-konflikt.** Om en bakgrunds-spar krockar med en
  annan enhet adopteras fjärrträdet (vars history-fil saknar de allra senaste
  lokala raderna); de raderna finns då kvar i konflikt-snapshoten under
  `~/.pia/conflicts/` men inte i den primära historiken efter reload. Filerna
  tappas inte (keep-both) — bara de sista pil-upp-raderna.
- **Bakgrunds- och förgrunds-spar är inte korsserialiserade.** Kedjan
  serialiserar bakgrunds-history-sparningarna sinsemellan, men ett *muterande*
  kommando sparar via `ctx.persist()` direkt. Kör man ett sådant medan en
  debouncad history-flush väntar på molnet kan de två racea adapterns base-version
  → en behandlas som en (falsk) samtidig-enhet-konflikt och läggs keep-both i en
  snapshot. Inget tappas (reconcile), men kommandots träd kan hamna "konfliktat".
  Att korsserialisera *alla* sparningar app-brett bedömdes oproportionerligt för
  v1 (rör kärnans persist-väg för varje kommando).

Täckt av 6 enhetstester (`history.ts`: parse/serialize/append, ignoredups, cap,
två-fönster-interleave) + 3 end-to-end (seedar pil-upp, sparar per kommando,
`-c` tömmer). Tour-golden uppdaterad (hjälptexten). typecheck + test + build gröna.

## Uppskjutet (medvetet)
- **`!!`/`!$`/`!n`-expansion** — en kärn-expansions-pass (som globbing), fortsatt
  egen uppföljning (låg på `history-command.md`).
- **`HISTIGNORE`/`ignorespace`** — filtrera bort rader ur history. Inte efterfrågat.

_Uppföljning på `history-command.md`; byggd direkt. Följer `roadmap/README.md`._
