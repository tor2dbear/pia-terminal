---
title: Roller på delade filer (owner/editor/viewer)
status: now
tags: [collab, permissions, supabase]
updated: 2026-08-07
---

## Levererat (Slice A, 2026-08-07)
Rollmodell på delade listor — kollaborationens motsvarighet till `/etc`-skyddet:
- **Roll per medlem** (`owner`/`editor`/`viewer`) i `shared_list_members.role` +
  `shared_list_invites.role`. RLS: `update` på `shared_lists` kräver
  `can_edit_list` (owner/editor) — viewer blockeras *på servern*, inte bara i
  klienten. Skaparen blir `owner`; en migration backfillar äldre installationer.
- **Read-only delning:** `todo share <name> <email> --ro` bjuder in som viewer;
  `--rw` (default) som editor. `Todo`-appen har ett read-only-läge (viewer):
  navigering funkar, muteringar är inerta, UI:t säger "(read-only)".
- **Ägaryta:** `todo members <name>` (medlemmar + roller, à la `ls -l`, inkl.
  pending invites), `todo unshare <name> <email>` (owner tar bort en medlem).
  Nya SECURITY DEFINER-RPC:er: `remove_member`, `delete_list`, `my_shared_lists`
  (roll i ett anrop), `list_members`. `leave_list` skyddar mot att ende ägaren
  lämnar och föräldralöser listan.
- **Invite-rätt:** editor + owner (Google-Docs-modellen); viewer aldrig.
- Täckt av `store.test` (roll-semantik: owner/editor/viewer, viewer-save nekad,
  editor får bjuda in, owner remove/delete, members-lista, sole-owner-leave) och
  terminal-tester i `todo.test` (`--ro` öppnar read-only; `members`; `unshare`).
- **SQL:en (`supabase/shared_lists.sql`) måste köras i Supabase SQL-editorn** för
  att aktivera rollerna i molnet (idempotent, uppgraderar befintlig install).

## Kvar (Slice B)
Roll-byte (promote/demote), ownership-transfer, och en `ls -l`-vy i själva
listan. `chmod`-flavor-ytan om vi vill gå mer Unix-rent senare.

## Mål
Ge delade listor en *rollmodell* istället för platt "alla är med-ägare". Det är
kollaborationens motsvarighet till skrivskyddet vi gav `/etc` (steg 1–3 i
`permissions.md`): en `chmod`/`chown`-liknande rättighetsyta, men på cloud-objekt
delade över konton, backat av Supabase-RLS.

## Nuläget (gapet)
`shared_list_members(list_id, user_id)` — ingen roll. Varje medlem kan redigera,
bjuda in, lämna. Saknas: skrivskyddad (read-only) delning; en ägare som kan *ta
bort* en medlem eller *radera* listan; "får inte bjuda in vidare". `created_by`
finns men är bara informativt (sätts null vid delete).

## Föreslagen modell — owner / editor / viewer
- **owner** — skaparen. Kan allt: redigera, bjuda in, sätta roller, ta bort
  medlemmar, radera listan. (Minst en owner måste alltid finnas.)
- **editor** — kan redigera innehåll + (beslut) ev. bjuda in.
- **viewer** — ser listan + live-uppdateringar, men `todo` nekar spara; kan inte
  bjuda in. RLS blockerar `update` på servern (inte bara i klienten).

Ny kolumn `shared_list_members.role text not null default 'editor'`. RLS:
`update`-policyn på `shared_lists` kräver `role in ('owner','editor')`; nya
SECURITY DEFINER-RPC:er för `set_role`, `remove_member`, `delete_list` som
verifierar att anroparen är owner. `invite_to_list` tar en roll-param.

## Terminal-idiom — flagga divergensen (per CLAUDE.md)
Invite-by-email är redan en accepterad web-divergens (närmaste Unix-kin är
`chmod`/`chown`/NFS-mounts). Roller ovanpå det ärver samma divergens. Ytan att
besluta:
- `todo share <name> <email> [--ro|--rw]` (default `--rw`) — bjud in med roll.
- `todo members <name>` — lista medlemmar + roller (à la `ls -l`).
- `todo unshare <name> <email>` — ta bort en medlem (owner).
- (senare) roll-byte/promote-demote, ownership-transfer.

## Öppna beslut (att ta ställning till)
1. **Rollvokabulär/yta:** owner/editor/viewer via `todo share --ro/--rw` +
   `todo members`/`todo unshare` — eller en renare `chmod`-flavor?
2. **Får `editor` bjuda in?** (Google-Docs: ja för editor; strängare: bara owner.)
3. **Slice-storlek:** A (MVP: roller + read-only + owner kan remove/delete) nu,
   B (roll-byte, ownership-transfer, `ls -l`-vy) senare — eller allt på en gång?

## Skiss på leverans (Slice A)
SQL-migration (role-kolumn + RLS + RPC:er) · `ShareStore`-utökning (roll i
`mine`/`invite`, nya `setRole`/`removeMember`/`deleteList`) · `MemoryShareStore`
speglar · `todo`-kommandots yta · viewer-nekan i klienten *och* RLS · tester
(collab + store) · en tour-rad · changelog-rad. Cutta som en `minor`.

_Följer `roadmap/README.md`. Ny idé → `inbox` tills vi valt slice + yta._
