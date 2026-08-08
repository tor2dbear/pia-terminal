---
title: "paket: pv — pipe viewer (ärlig mätare)"
status: inbox
tags: [packages]
updated: 2026-08-08
---

## Mål
`pv` (Pipe Viewer) — det klassiska Unix-verktyget som sitter mitt i en pipe och
visar genomströmning: bytes, hastighet, ETA, en bar som fylls. Idé: ta in det som
`brew`-paket (som `sl`/`cowsay`/`coreutils`), men **utan att ljuga om maskinen**
(samma linje som påsk-äggen, se `roadmap/easter-eggs.md`).

## Research

### Utgångspunkt (kul disambiguering)
Idén väcktes av en Google-AI-översikt som inte kunde bestämma sig för om
"PV-terminal" betyder Linux-`pv` eller *solcellsterminaler* (photovoltaic). Vi
menar `pv`.

### Den avgörande begränsningen: pia:s pipes är buffrade, inte strömmande
`executePipeline` (`src/terminal/terminal.ts:1190–1226`) kör stegen i en vanlig
for-loop, ett i taget:

```
input = ""
för varje steg:
    kör steget med stdin = input   ← väntar tills det är HELT klart
    input = allt steget skrev ut (hopfogat till EN sträng)
```

Alltså: **sekventiellt och helbuffrat.** Nästa steg börjar inte förrän det förra
returnerat. Riktiga Unix-pipes är tvärtom *samtidiga* (alla processer lever på en
gång, kärnbuffertar emellan, data rinner igenom allteftersom, med backpressure).

Konsekvens: **`pv` har inget flöde att titta på.** När `pv` väl kör finns hela
dess input redan som en färdig sträng, och hela dess output produceras innan
nästa steg vaknar. En "live"-bar skulle hoppa 0→100 direkt — dvs. fejk.

### Alternativen
- **A) Ärlig engångsmätare (default).** `pv` släpper igenom stdin→stdout
  oförändrat och skriver *en* sann rad: bytes som passerade (`[passed]`). Ingen
  animerad bar (inget att animera). Ärliga flaggor: `-b` (byteräknare), `-n`
  (numeriskt). Trogen men blygsam — i praktiken en `wc -c` mitt i röret.
- **B) `pv -L <rate>` — den ärliga animationen.** Rate-limit *pacar data på
  riktigt*: för att hålla "max X kB/s" måste `pv` portionera ut sin egen output
  över tid. Den fördröjningen är äkta (du bad om den), så baren får röra sig
  sanningsenligt. Kul "skrivmaskinseffekt": `cat dikt.txt | pv -L 20`.
  Nyans: i buffrad modell strypér `pv` sitt *eget* genomsläpp, men nästa steg
  väntar ändå och kör sen direkt — så `-L` skapar ingen riktig backpressure
  nedströms. Men det *lovar* det inte heller; löftet "≤X kB/s" hålls sant.
- **C) `pv` framför något redan långsamt.** Äkta långsamhet finns i `ping`,
  `python`, remote-cat/ls — men de matar inte byte-ström-pipes. Återvändsgränd
  i nuvarande arkitektur.

### Nyckelinsikt: mätarens rätta hem är `brew install`, inte pipes
Den ärliga genomströmningsmätaren hör egentligen hemma där det *finns* ett äkta
async-moment med känd storlek: `brew install` gör en riktig dynamisk
`import()` av en chunk. Se syskonpucken `brew-install-progress.md`. `pv` i pipes
förblir A + (ev.) B.

## Beslutat spår (om/när det byggs)
Skeppa **A + B**: ärlig direkt-summering som default; `-L` som ärligt portionerad
med levande bar. **Aldrig** fejkad ETA/bar utan `-L`.

## Öppna frågor
- **Värt att bygga alls?** Utan flöde är `pv` i pipes mest en gest. Kanske hellre
  lägga energin i `brew-install-progress` och hålla `pv` minimal — eller skippa.
- Determinism i touren: A ger en byte-siffra (deterministisk, OK); `-L` innebär
  tidsberoende animation → måste redigeras/undvikas i golden.

## Arkitektur-sidospår: async/strömmande pipes — för/nackdelar
Det enda som gör `pv` (och `tail -f`, `yes`) *äkta by default* är att byta
pipeline-modellen från buffrad-sekventiell till **samtidig-strömmande** (alla
steg lever samtidigt, kopplade av async-kanaler med backpressure). Stor sak:

**Skulle kräva:** nytt kommandokontrakt (stdin blir en async-iterator av bitar
istället för en sträng; varje kommando skrivs om eller körs genom en buffrande
shim) + en schemaläggare som kör alla steg samtidigt med begränsade buffertar.

**Fördelar**
1. `pv` blir äkta by default (mätning i flykten, sann ETA).
2. Konstant minne för stora data. *(Dämpat här: pia:s VFS ligger ändå i RAM.)*
3. Tidig avslutning (`yes | head -1` stoppar producenten) → oändliga strömmar
   blir uttryckbara (`yes`, `tail -f`, live-flöden).
4. Äkta Unix-idiom (backpressure, tidig exit) — stort för "lär dig terminalen".
5. Levande output (spinners, live-filter).

**Nackdelar / kostnader**
1. Enormt kontraktsbyte: varje kommando + ScreenApp-värd + tester skrivs
   om/shimmas. Hög regressionsrisk i en mogen svit.
2. Komplexitet: backpressure, fel mitt i en ström, halvskrivna redirect-filer,
   svårare Ctrl-C (riv ner alla levande steg).
3. **Determinism — dyrast.** Touren (golden-snapshot) är pia:s centrala
   verifiering och bygger på fullständigt ordnad output. Samtidiga steg som
   varvar utskrifter → icke-deterministisk ordning → golden-modellen skadas.
4. Redirect/capture måste bli inkrementella.
5. DOM-genomströmning kräver batchning (rAF) för många småbitar.
6. **Liten payoff:** pia:s pipes är korta, små, mänskliga (`sort | uniq`). De
   problem streaming löser saknas mest.

**Mellanväg (rekommenderad):** behåll buffrad modell; special-lös de få
strömmiga verktygen. `pv -L` animerar sig självt (alt B); `yes`/`tail -f` byggs
som screen-appar eller kommandon med egen intern loop + Ctrl-C, inte som
pipeline-steg. ~80 % av idiomet för ~5 % av kostnaden. Full streaming övervägs
*först* om ett framtida mål (live-flöden, big-data-pedagogik) gör det till ett
förstahandskrav — och även då väger determinism-kostnaden tungt.
