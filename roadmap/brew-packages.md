---
title: brew — paket/appar frikopplade från kärnan
status: inbox
tags: [packages, architecture]
updated: 2026-07-18
---

## Mål
Ett sätt att bygga "appar/paket" **frikopplade från huvudappen**, installerade
on-demand — homebrew-känsla: `brew install <app>` lägger till kommandon/screen-
appar i din PIA utan att blåsa upp kärnan.

## Varför det passar PIA
- Extension-punkterna finns redan: command-registry (`{name,help,run}`) och
  screen-app-hosten (`ScreenApp` via `runApp`). Ett paket = en modul som
  registrerar kommandon och/eller en screen-app — **samma sömmar som motorn**.
- Håller kärnan smal: appar lazy-laddas (dynamisk import av lokala chunks) först
  när de installeras; tree-shakas bort tills dess.

## Haken (viktig)
- **Riktiga homebrew installerar godtycklig kod från internet.** PIA:s strikta CSP
  (`script-src 'self'`) blockerar fjärr-JS i runtime — samma vägg som python-wasm-
  spiken slog i. Så paket måste **shippa med appen** (samma origin) och lazy-laddas.
  Det blir en *kurerad katalog av valfria inbyggda appar*, inte "vilket paket som
  helst från vem som helst".
- Äkta tredjeparts-paket kräver antingen lättare CSP (säkerhetskostnad) eller en
  sandlåda (iframe/worker + meddelande-protokoll) — mycket större grej, utanför v1.

## Skiss (om vi bygger v1)
- `src/packages/<name>/` — varje paket exporterar ett manifest: `{ name, help,
  commands?, apps? }`. Inte importerat av kärnan → tree-shakat tills installerat.
- `brew list` (katalog) · `brew install <name>` (dynamisk import + registrera) ·
  `brew uninstall` · installerad uppsättning i `~/.pia/packages`, laddas om vid boot.
- Kandidater att flytta ut / bygga som paket: snake, 2048, draw, äventyret.

## Öppna frågor
- Bara inbyggd katalog, eller en manifest-fil man kan peka om?
- Relation till motor-extraktionen: samma sömmar, men "paket i PIA" vs "bygg eget
  skal på motorn" är två olika produkter — bra att hålla isär.

_Ligger i `inbox`. On-brand och arkitektoniskt snyggt; störst öppen fråga är CSP-
gränsen för äkta tredjepart._
