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
  och filen) via en `histIgnore`-predikat-söm på `Terminal`, matchad i `main.ts`
  (`hasSecret`). Annars hade ett synkat `~/.pia/history` läckt klartext-lösenord.
- **Konflikt-reconcile även för bakgrunds-sparningen.** Den debouncade sparningen
  gick först direkt mot `adapter.save` och svalde `StorageConflictError` → nästa
  spar hade kunnat skriva över en samtidig moln-ändring från en annan enhet. Nu
  går den genom `Terminal.flush()` → samma `persistTree()`-reconcile (keep-both,
  stash under `~/.pia/conflicts/`) som alla kommando-drivna sparningar.

Täckt av 6 enhetstester (`history.ts`: parse/serialize/append, ignoredups, cap,
två-fönster-interleave) + 3 end-to-end (seedar pil-upp, sparar per kommando,
`-c` tömmer). Tour-golden uppdaterad (hjälptexten). typecheck + test + build gröna.

## Uppskjutet (medvetet)
- **`!!`/`!$`/`!n`-expansion** — en kärn-expansions-pass (som globbing), fortsatt
  egen uppföljning (låg på `history-command.md`).
- **`HISTIGNORE`/`ignorespace`** — filtrera bort rader ur history. Inte efterfrågat.

_Uppföljning på `history-command.md`; byggd direkt. Följer `roadmap/README.md`._
