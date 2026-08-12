---
title: mount — privata filer från egen server
status: inbox
tags: [storage, vfs]
updated: 2026-08-12
---

## Mål
(Research, inte beslutat.) Kunna `mount`:a en mapp från en egen/privat server och
jobba i den från terminalen — så att verkligt privata filer aldrig behöver ligga i
den delade Supabase-backenden. Idag ligger hela filträdet för en inloggad
användare som en enda `jsonb`-rad per användare i tabellen `filesystems`
(`src/supabase/storage.ts`); gäster i `localStorage`; `HybridStorageAdapter`
ruttar på auth-läge. Allt eller inget, en backend.

## Idiom
`mount` är ren Unix — **ingen divergens att flagga**. En privat server-mapp hör
till `mount`/`sshfs`/NFS-familjen; namnet ger sig självt. En mount-punkt (t.ex.
`/mnt/server`) och ett `mount`/`umount`-kommando ligger rätt i idiomet.

## Research

**Arkitektoniskt passar det i `StorageAdapter`-sömmen** — det är precis vad den är
till för. Två rimliga former:

- **Ny adapter + mount-begrepp i VFS.** En `WebDavAdapter` / `HttpMountAdapter`
  plus en *mount-tabell* (path → adapter) i path-resolvern, så läs/skriv under
  mount-punkten ruttar till en annan backend. Idag laddas trädet som *en* blob —
  per-subträd-routing är den nya primitiven som saknas.
- **Lättare variant som återanvänder `shareId`-mönstret — men lättheten är en
  synvilla.** `shareId` är *inte* en generell per-fil-routing-söm: `linkedContent`/
  `linkedSave` anropas bara från `nano`/`todo`/`transfer`, medan `cat`, text-utils,
  `cp` och shell-redirection läser `FileNode.content` (cachen) direkt (`fs.ts` rör
  bara `shareId` för `@`-dekoration). Generaliserar man mönstret till kataloger utan
  att flytta routingen *under alla* VFS-ops får man stale reads och lokala-bara
  skrivningar. Så den här varianten är i praktiken lika stor som "ny adapter +
  mount-tabell" ovan, inte en genväg.

**Privatläckan att designa bort från dag ett:** om en mountad fils innehåll cachas
i `FileNode.content` (som `shareId`-mönstret gör) läcker de privata bytes till den
delade backenden. `linkedSave` (`src/commands/linked.ts`) gör `writeFile` + `persist`,
och `SupabaseStorageAdapter` skriver *hela trädet* till `filesystems`-raden — dvs det
"privata" innehållet hamnar i Supabase, precis tvärtemot målet. Konsekvens: det
serialiserade trädet får bära **bara mount-metadata** (path, endpoint, ev. token-ref);
all filcache måste bo *utanför* det serialiserade trädet (minne/IndexedDB som aldrig
persistas via storage-adaptern).

**Bromsklossarna sitter i browsersandlådan, inte i PIA-koden:**

- **Ingen rå-fs/SSH/NFS från browsern.** "Mounta privat server" betyder i
  praktiken att servern kör ett HTTP-API browsern når — realistiskt **WebDAV**
  (Nextcloud, Apache, `rclone serve webdav` talar det) eller ett litet eget API.
- **CSP är den skarpaste konflikten.** Vi shippar en strikt *statisk* `connect-src`
  (`vite.config.ts`, byggd vid build-tid) som bara släpper `'self'` + Supabase.
  Går inte att lägga till en godtycklig användarorigin i runtime. Utvägar: vidga
  `connect-src` till `https:` (försvagar skyddet — motverkar hela CSP-arbetet),
  eller proxa via en Cloudflare Worker (men då passerar trafiken ändå oss, vilket
  motverkar "privat").
- **CORS + HTTPS.** Servern måste skicka CORS-headers för `pia.tor2dbear.com` och
  köra giltig TLS (mixed-content blockeras). Hemmaservrar med self-signed cert
  faller på det.

**Alternativ värda att väga mot en riktig mount:**

- **Egen self-hostad Supabase.** Om målet bara är "mina filer inte på den delade
  instansen": peka appen mot egen Supabase (config dynamic-importas redan,
  `.env.production`). Allt privat, ~noll ny kod. Byter hela backenden, inte en
  per-mapp-mount — men löser 80 % av behovet billigast.
- **`File System Access API`** kan mounta en *lokal* katalog utan server alls — men
  det är lokal disk, inte "privat server", och Safari saknar stöd.

## Öppna frågor
- Vad är det egentliga behovet — "inte på den delade Supabasen" (→ egen Supabase,
  billigt) eller "genuint mounta en fjärrmapp" (→ WebDAV-adapter, dyrt)?
- Hur löser vi CSP för godtycklig origin utan att antingen försvaga den eller proxa
  genom oss? Kanske: en explicit allowlist användaren själv får bygga in, dvs
  mount kräver en rebuild/egen deploy? Flagga innan bygge.
- Var bor mount-tabellen — i VFS (i minnet) eller i storage-lagret? Lutar åt att
  hålla VFS rent och lägga routingen i ett lager ovanför adaptrarna.
- Offline/cache-semantik: ren read-through varje gång, eller en lokal cache — som
  då måste ligga *utanför* det serialiserade trädet (se privatläckan ovan)? Vad
  händer när servern är nere mitt i en session?
- WebDAV-auth i browsern (Basic/Bearer) utan att läcka credentials in i det
  serialiserade trädet — var lagras token?

_Ligger i `inbox` tills det blivit ett beslut. Befordra till `next/later` då._
