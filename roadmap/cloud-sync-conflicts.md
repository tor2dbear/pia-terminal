---
title: Konflikthantering vid cloud-sync
status: inbox
tags: [storage, supabase]
updated: 2026-07-17
---

## Mål
(Ännu inte beslutat — det här är research.) När samma dokument redigeras på två
enheter mot Supabase-backenden: vad händer? Idag är sista-skrivning-vinner
implicit, vilket tyst kan äta ändringar. Vill förstå alternativen innan vi
lovar något.

## Research
- **Last-write-wins (nuvarande, implicit):** enklast, men tappar data tyst.
  Oacceptabelt som *tyst* beteende; kanske okej om vi åtminstone *varnar*.
- **Version/`updated_at`-koll:** klienten skickar den version den läste; skiljer
  den sig i DB → avvisa och visa "dokumentet ändrades på annat håll". Kräver ett
  versionsfält och att adaptern kan returnera en konflikt. Rider på samma
  `StorageAdapter`-söm, inget nytt gränssnitt utåt.
- **CRDT/operational transform:** riktig sammanslagning teckennivå. Kraftfullt
  men rejält mycket komplexitet för en enmansterminal. Nästan säkert overkill.
- Prior art värt att läsa: hur `git` formulerar konflikter (behåll båda, markera
  tydligt) mappar fint mot terminal-idiomet — en konflikt kunde bli en
  `.orig`-fil bredvid, inte en modal.

## Öppna frågor
- Är det här ens ett verkligt problem i praktiken? Hur ofta redigerar *du* samma
  doc på två enheter samtidigt? Om nästan aldrig → varna-och-vinn räcker långt.
- Om vi gör versionskoll: var bor versionsfältet — i VFS-noden eller bara i
  storage-lagret? Lutar åt storage, så VFS förblir rent i minnet.
- Terminal-idiom: finns en kommandoyta för att lösa konflikt (`diff`, behåll
  vilken)? Eller är det editor-internt? Flagga innan bygge — kan vara en
  web-divergens.

_Ligger i `inbox` tills det blivit ett beslut. Befordra till `next/later` då._
