---
title: AI-kontext via MCP-connector
status: inbox
tags: [mcp, ai]
updated: 2026-07-17
---

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

## Öppna frågor
- Värt det jämfört med motor-extraktionen (se `terminal-engine-package`)? MCP är
  troligen billigare och mer aktuellt; motorn visar djupare ingenjörskonst.
- Läs-först? Skriv öppnar "AI skriver över filer osett" — börja read-only.
- Om skriv: vilka mappar är skrivbara (t.ex. bara `inbox/`), och behövs en
  bekräftelse-/diff-gate?
- Token vs OAuth för v1.

_Ligger i `inbox` tills det blivit ett beslut. Befordra till `next/later` då._
