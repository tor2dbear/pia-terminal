---
title: Rättigheter — skrivskyddat systemträd + sudo som escape-hatch
status: next
tags: [shell, fs, teaching]
updated: 2026-08-07
---

## Mål
Ge `sudo` (och på sikt `chmod`/`chown`) en *riktig referent*. PIA saknar
rättighetsmodell — allt är ditt — så `sudo` är idag bara persona. Idén: ett litet
skrivskyddat systemträd (`/etc`, `/bin`, `/usr`) som `sudo` kan öppna, så att
"elevera" faktiskt betyder något. Bygger också en pedagogisk yta (Unix-behörighet
att öva på) och knyter ihop befintliga features (boot-hälsning, neofetch).

## Upplägg i tre steg (var och en shippbar för sig)
1. **Seeda systemträdet** — filerna *finns* och *används*, ingen låsning. ✅ *(gjort)*
2. **Skrivskydda** systemsökvägarna — `rm /etc/motd` → `permission denied`.
3. **`sudo`-elevation** — `sudo <cmd>` kör kommandot med skyddet av; escape-hatchen.

## Levererat (steg 1, 2026-08-07)
`src/pia/etc.ts` (`seedSystemFiles`): en liten `/etc`, seedad idempotent vid boot
(global, inte per-home) i `main.ts` bredvid `seedDefaultPackages`.
- **`/etc/motd`** — message-of-the-day; boot-hälsningen läser den nu (`boot.ts`
  tar en `motd`-option, `DEFAULT_MOTD` som fallback). *Din* fil: seedas bara när
  den saknas (edits överlever), och self-healar om du raderar den.
- **`/etc/os-release`** — maskinägd OS-identitet (samma version som `neofetch`),
  skrivs alltid om till körande version så den inte driftar.
- `ls /` visar nu `etc/  home/`. Täckt av `etc.test.ts` (seed/edit-överlevnad/
  self-heal/os-release-refresh) + en tour-rad (`ls /`, `cat /etc/os-release`).

Ingen låsning ännu: `rm /etc/motd` funkar (men kommer tillbaka vid boot); och
`sudo rm /etc/motd` *avböjer* (stubben kör inget) — så `sudo` skyddar dig just nu
genom att inte göra något, tills steg 3 vänder på det.

## Kvar (steg 2–3, öppna beslut)
- **Skydd (steg 2):** enklast en uppsättning skyddade sökvägs-prefix som VFS:ens
  `writeFile`/`mkdir`/`remove`/`move` kollar och kastar `permission denied` på —
  ingen per-nod-metadata, inga ändringar i det serialiserade trädet. (Alternativ:
  `readonly`-flagga per nod — flexiblare men bloatar trädet + kräver migrering.)
- **Elevation (steg 3):** behöver en väg för `sudo` att *köra* payloaden med
  skyddet av. Antingen en motor-söm `ctx.exec(rad, { elevated })` (troget, kör om
  genom riktiga pipeline-köraren med glob/pipes/alias intakta) eller ett
  session-läge (`sudo -s` elevar tills `exit`). Söm-varianten är den faithful
  men dyrare biten.
- **Överlapp med `chmod`/`chown`:** när skydd finns är en simulerad rwx-modell
  (öva-på-behörighet) ett naturligt nästa steg (tidigare "alternativ D").

_Byggd steg 1 direkt den här sessionen; steg 2–3 medvetet uppskjutna. Följer
`roadmap/README.md`._
