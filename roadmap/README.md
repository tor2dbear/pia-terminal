# Roadmap — konvention

En **puck** = en sak vi vill bygga. Varje puck bor i en egen fil här under
`roadmap/`. Sanningen är ren markdown i repot: läsbar för dig i editorn, för en
agent via `cat`/`grep`, och tänkt att skördas av en extern aggregator-sajt som
ger en visuell överblick över flera repon. Ingen inlåsning — det här är bara
filer.

> **Fältnamnen och statusvärdena nedan är ett gränssnitt.** De läses av verktyg
> (aggregatorn), så håll dem exakt som specificerat och på engelska. Brödtexten
> skriver du fritt, på svenska.

## En puck = en fil (eller en mapp)

Default är en fil per puck:

```
roadmap/
  grep-context.md
  nano-multibuffer.md
  cloud-sync-conflicts.md
```

**Filnamnet (slug) är puckens stabila ID och ankarlänk.** Byt inte i onödan.
Använd korta, beskrivande slugs med bindestreck. Skippa nummerprefix (`001-`) —
ordning styrs av `order`-fältet, inte filnamnet.

När en puck behöver **bilagor** (skisser, bilder, flera dokument) befordrar du
den från fil till mapp med samma slug:

```
roadmap/
  nano-multibuffer/
    README.md          ← själva pucken (samma format som en fil-puck)
    layout-skiss.png
    prior-art.md
```

Regeln aggregatorn följer: **en puck är antingen `roadmap/<slug>.md` eller
`roadmap/<slug>/README.md`.** Inget annat behöver ändras när du befordrar.

## Frontmatter

Varje puck inleds med YAML-frontmatter:

```markdown
---
title: Nano: multi-buffer
status: next
tags: [editor]
updated: 2026-07-17
issue: 42
order: 10
---
```

| Fält      | Krav    | Betydelse |
|-----------|---------|-----------|
| `title`   | ja      | Kort rubrik för brädet. |
| `status`  | ja      | Ett av: `inbox`, `now`, `next`, `later`, `done`. Se lifecycle. |
| `updated` | ja      | `YYYY-MM-DD`, senast rörd. Aggregatorn sorterar och visar färskhet på den. |
| `tags`    | nej     | Områden, t.ex. `[editor]`, `[auth]`. För filtrering. |
| `issue`   | nej     | Nummer på arbets-issuet i repot, när pucken är i arbete. |
| `order`   | nej     | Manuell ordning **inom** en statuskolumn (lägre = högre upp). Faller tillbaka på `updated`. |

## Brödtext

Fri markdown under frontmattern. Rekommenderad stomme — ta bort det som inte
behövs:

```markdown
## Mål
En mening om varför pucken finns.

## Research
Länkar, alternativ jag vägt, beslut och varför. Det som annars blir hemlöst.

## Öppna frågor
- ...
```

Poängen med en fil per puck: **researchen bor i pucken från dag ett** istället
för att skräpa ner en gemensam fil. En puck får vara hur tjock som helst utan
att störa någon annan.

## Lifecycle (status)

```
inbox  →  now / next / later  →  done
```

- **`inbox`** — råmaterial och research som ännu inte är ett beslut. Lägg
  förhandsresearch här direkt; aggregatorn visar `inbox` dämpat i en egen
  kolumn (eller döljer den på en publik vy). Ingenting här är ett löfte.
- **`now`** — aktivt i arbete just nu. Håll den kort.
- **`next`** — närmast på tur, beslutat.
- **`later`** — vill göra, inte snart.
- **`done`** — levererat. Aggregatorn fäller ihop/arkiverar. Behåll filen som
  historik; radera inte.

En puck börjar oftast i `inbox`, befordras till `now/next/later` när den blivit
ett faktiskt beslut, och landar i `done`. Uppdatera `updated` varje gång du rör
statusen eller innehållet.

## För agenter

- Jobbar du i en specifik puck? Öppna `roadmap/<slug>.md` — allt om den (mål,
  research, öppna frågor) finns där.
- Vill du se helheten för repot? `ls roadmap/` och läs frontmattern.
- När du börjar på en puck: sätt `status: now`, koppla `issue:` om det finns
  ett, och uppdatera `updated`. När det är levererat: `status: done`.
- Skapa nya puckar i `inbox` om det inte är beslutat — inte i `now/next/later`.
