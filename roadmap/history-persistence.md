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
  vid logout). `flushPending` väntar dessutom in en redan *pågående* sparning
  (inte bara en väntande timer), så en transition inte byter identitet mitt i en
  save som ännu inte hunnit landa.

## Kända v1-begränsningar (medvetet dragen gräns)
- **`beforeunload` mot molnet är best-effort.** En mutation och ett konto­byte
  sparas synkront, och localStorage (gäster + Hybrid-adapterns lokala hälft)
  hinner skriva under unload. Men en *ren läskommando-rad* som körs <1.5 s innan
  fliken hårt-stängs på ett moln-konto kan tappas — browsern väntar inte in det
  async nätverks-anropet. Accepterad browser-begränsning (samma som att en
  hård-dödad bash tappar osparad history).

Täckt av 6 enhetstester (`history.ts`: parse/serialize/append, ignoredups, cap,
två-fönster-interleave) + 3 end-to-end (seedar pil-upp, sparar per kommando,
`-c` tömmer). Tour-golden uppdaterad (hjälptexten). typecheck + test + build gröna.

## Uppskjutet (medvetet)
- **`!!`/`!$`/`!n`-expansion** — en kärn-expansions-pass (som globbing), fortsatt
  egen uppföljning (låg på `history-command.md`).
- **`HISTIGNORE`/`ignorespace`** — filtrera bort rader ur history. Inte efterfrågat.

_Uppföljning på `history-command.md`; byggd direkt. Följer `roadmap/README.md`._
