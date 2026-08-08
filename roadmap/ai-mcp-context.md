---
title: AI-kontext via MCP-connector
status: now
tags: [mcp, ai]
updated: 2026-08-08
---

## Levererat (v1 — kod klar, deploy kvar)
`mcp`-kommandot + en Supabase Edge Function som exponerar användarens
filsystem-rad som en **remote MCP-server**. Besluten på de öppna frågorna:

- **Host: Supabase Edge Function** (inte Cloudflare Worker som pucken gissade).
  Skäl: ingen Worker-infra fanns, medan Supabase redan är uppsatt; och
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` injiceras automatiskt i edge
  functions, så det finns **ingen hemlighet att kopiera in för hand**. Kostnad:
  free-tier räcker (personligt bruk ≈ 0 kr).
- **Auth: scoped bearer-token**, inte OAuth (OAuth = senare). `mcp token <label>`
  myntar, visar plaintext **en gång**, lagrar bara SHA-256-hashen. Edge-funktionen
  hashar presenterad token likadant och slår upp raden (service role).
- **Scope: read allt, write bara under `inbox/`.** Löser "AI skriver över filer
  osett" — allowlisten sitter som konstant i edge-funktionen; write återanvänder
  filesystems optimistic-concurrency-guard (retry en gång vid krock).
- **Logged-in-only by design** — guests har ingen delad rad att nå; `mcp` svarar
  ärligt "run `login`" (speglar `notify`).

Pjäser: `src/mcp/tokens.ts` (söm: Null/Memory + token/hash-helpers),
`src/supabase/tokens.ts` (Supabase-store), `src/commands/mcp.ts`,
`supabase/mcp.sql` (tabell `mcp_tokens` + RLS), `supabase/functions/mcp/index.ts`
(JSON-RPC-server, verktyg `pia_list`/`pia_read`/`pia_write`). Tester + tour-rad
för guest-vägen.

**Kvar (rör produktion, görs på ägarens ok):** kör `supabase/mcp.sql` mot
projektet och `supabase functions deploy mcp --no-verify-jwt`. Sen: verifiera från
en riktig AI-klient (Claude iOS custom connector) mot den deployade URL:en.

## Mål
(Research, inte beslutat.) Låta en AI läsa/skriva PIA:s filer från en chatt —
"kolla `docs/portfolio/`", "lägg en notis i `inbox/`". Idén: PIA exponerar sitt
eget filträd som en **remote MCP-server**, så vilken AI-klient som helst (Claude
på iOS ingår) kan koppla in som användaren.

## Research
- **Mekanism:** filträdet lever redan bakom `StorageAdapter`. En MCP-yta blir
  ännu en konsument av samma träd — samma söm, exponerad *utåt* istället för
  nedåt mot storage. Ingen ny säkerhetsmodell: Supabase-RLS scopar per användare.
- **Delad DB:** förutsätter inloggad Supabase-användare — guest-läget
  (localStorage) lever bara i fliken och kan inte nås utifrån. Featuren är
  logged-in-only by design.
- **Host:** remote MCP kräver en HTTP-server. Passar en **Cloudflare Worker** i
  samma projekt — ingen ny infra. Verktyg: `list`/`read` (+ ev. `write`).
- **Auth:** enklast en scoped bearer-token man genererar i PIA (`pia token`,
  `pia token revoke`) och klistrar in i AI-klienten. OAuth är "rätt" men
  överkurs för v1.
- **iOS:** custom connectors via remote MCP funkar i Claude på iOS (även Free) —
  connectorn läggs till på claude.ai i webben och *synkar* till mobilen.
- **Supabase free räcker:** textfiler är kb, inte MB. Enda fällan är
  7-dygns-inaktivitetspausen — redan hanterad av keep-alive (PR #6–7).

### Avfärdat: PIA som backend för KB-systemet
Vägde att låta det mejl-drivna KB-systemet (Gmail-capture → Synology-worker →
`kb/` git + daglig digest) bo i PIA. **Nej.** KB:ns ryggrad är en
sekretessgradient (NAS-only → git-speglat offsite → efemär digest). Supabase
*är* offsite, så att lägga KB där punkterar precis den vägg systemet är byggt
runt. Dessutom löser GitHub-connectorn redan "läs min `kb/` i en chatt" — `kb/`
är ju redan ett git-repo offsite. PIA tillför inget där. Håll projekten separata.

### Ärlig omframning
Som *produktivitetsverktyg* är den här svag — den drar PIA mot commodity-nytta
där PIA saknar edge. Den lever bara omframad till PIA:s faktiska skäl: **lärande
+ portfolio + kul**. Att bygga en egen MCP-connector är en aktuell, CV-stark
signal (2026) och on-brand om den exponerar PIA:s *egna* leksaks-fs ("chatta med
min lilla dator") — inte om den blir "personlig moln-databas".

## User stories
Konkretiserar riktningen **filer *ut* till en extern AI** (motsatt riktning —
en röst *in* i PIA — bor i `ai-host-persona`). Håll dem inramade i PIA:s faktiska
skäl (*lärande + portfolio + kul*, "chatta med min lilla dator"), inte som
"personlig moln-databas" — se den ärliga omframningen ovan.

- **US 1 — fånga en tanke från mobilen.**
  *Som* PIA-användare på språng *vill jag* be Claude på iOS lägga en rad i min
  PIA-inbox *så att* idén hamnar i min lilla dator utan att jag öppnar terminalen.
  Flöde: agenten är kopplad som MCP-klient, skriver `~/inbox/<datum>.md`; nästa
  boot visar `cat inbox/<datum>.md` raden. Samma fil, två klienter. Kräver
  `write` (scoped, se öppna frågor) — läs-först-varianten faller tillbaka på US 2.
- **US 2 — låt en agent läsa och sammanfatta (read-only).**
  *Som* någon med en rörig `notes/` *vill jag* be en agent sammanfatta veckan
  *så att* jag får överblick utan att läsa allt. Agenten `list`/`read` över MCP;
  resultatet klistras tillbaka av mig (eller skrivs till fil om `write` finns).
  **Detta är v1** — ren `list`/`read`, ingen skrivrisk, on-brand ("chatta med min
  lilla dator").
- **US 3 — skrivbar bara där det är ofarligt.**
  *Som* försiktig ägare *vill jag* att en agent bara får skriva i utpekade mappar
  (t.ex. `inbox/`) *så att* "AI skriver över filer osett" aldrig kan hända i
  `docs/` eller `.pia/`. Motsvarar öppen fråga om skriv-scope + ev. diff-gate.

## Öppna frågor (kvar efter v1)
- **Per-token scopes.** Idag får varje token samma yta (read allt + write
  `inbox/`). Nästa steg: välj scope vid `mcp token` (t.ex. read-only, eller andra
  skrivbara mappar) och lagra det per rad istället för en konstant i funktionen.
- **Diff-/bekräftelse-gate på write.** v1 skriver rakt (guardad mot krock men utan
  människa-i-loop). Vill vi ha en förhandsgranskning innan en agent-write landar?
- **OAuth istället för klistrad token.** "Rätt" men överkurs — bearer räcker för v1.
- Värt det jämfört med motor-extraktionen (se `terminal-engine-package`)? Bägge
  kan leva; MCP är mer aktuellt, motorn visar djupare ingenjörskonst.

_Befordrad till `now` (kod klar). Går till `done` när funktionen är deployad och
verifierad från en riktig AI-klient._
