---
title: userdel — självbetjänad konto- och dataradering (+ privacy-notis)
status: next
tags: [auth, privacy, supabase]
updated: 2026-08-08
---

## Mål
Ge en inloggad användare en väg att **radera sitt eget konto och all sin data** —
"rätten att bli glömd", terminaltroget som `userdel` (alias `deluser`). Idag går
det bara att `logga ut`; data (e-post, filträd, delade listor, push-subs) ligger
kvar för alltid utan självbetjäning. Passar PIA:s honesty-linje: `sudo` eleverar
på riktigt → och du kan faktiskt radera dig. Inspirerat av hollr.at:s auto-expiry.

## Datamodell (vad ett konto äger)
Nästan allt **cascade-raderas** när `auth.users`-raden tas bort (`on delete
cascade`):
- `filesystems` (hela VFS-trädet) · `notifications` · `push_subscriptions` ·
  `reminders` · `shared_list_members` · `shared_list_activity`.
- `shared_list_invites` keyas på e-post, inte user_id → en invite *adresserad*
  till din e-post blir en dinglande rad (harmlös; städa ev. på e-post).
- `shared_lists.created_by` → `on delete set null` (listan överlever).

**Enda icke-triviala biten:** en delad lista du är *ensam ägare* till blir
**ägarlös** när din medlemsrad cascade-raderas — exakt orphan-problemet från
roll-arbetet. `userdel` måste därför, före auth-raderingen, för varje sådan lista
antingen (a) radera listan, (b) auto-promota en kvarvarande medlem till owner
(= Slice B-biten), eller (c) neka tills du hanterat dem. Beslut nedan.

## Hur radera auth-användaren (huvudbeslutet)
Klienten kan **inte** radera sitt eget auth-konto med anon-nyckeln. Två vägar:

- **A) `SECURITY DEFINER`-RPC** `delete_own_account()` — en funktion ägd av
  `postgres` kör `delete from auth.users where id = auth.uid()` (auth:s egna
  barntabeller — sessions/identities/refresh_tokens — cascade-raderas med). Anropas
  från browsern via `rpc()`, precis som roll-RPC:erna. **Enklast, ingen ny infra.**
  Caveat: når in i `auth`-interna tabeller direkt (Supabase föredrar admin-API:t).
- **B) Edge Function** med `service_role` som anropar `auth.admin.deleteUser(uid)`
  — Supabases välsignade väg, och vi har redan Edge Functions (push/reminders,
  0.9.0). Mer infra men "by the book"; gör pre-städningen + admin-delete i ett steg.

**Lutar åt A** (enkelt, konsekvent med appens RPC-tunga design; auth-barn cascade:ar
ändå). B om vi vill vara konservativa mot auth-interna.

## Kommandoyta (terminaltroget + destruktivt)
`userdel` (alias `deluser`). Irreversibelt → **kräver bekräftelse**: t.ex. skriv
om ditt användarnamn, eller `userdel --yes`. Flöde: bekräfta → RPC/Edge → sessionen
är död → `reloadFs` → tillbaka till guest, "account deleted". Seam: `AuthAdapter`
får ett valfritt `deleteAccount()`; `SupabaseAuthAdapter` implementerar; `Memory`/
`Fake` no-op/stub så testerna driver flödet.

## Öppna beslut
1. **Auth-radering:** A (RPC) eller B (Edge Function)? *(lutar A)*
2. **Ensam-ägda delade listor:** radera dem, auto-promota nästa medlem (Slice B),
   eller neka userdel tills de hanterats? *(lutar auto-promota — snällast, och drar
   in Slice B-biten vi ändå behöver)*
3. **Bekräftelse-UX:** skriv-om-namnet vs `--yes`-flagga vs båda?

## Bonus: privacy-notis
Kort, ärlig integritets-/datanotis terminaltroget — vad som lagras (e-post + dina
filer i Supabase), "ingen tracking/annonser, personligt projekt", hur man raderar
(`userdel`). En `man privacy`-sida eller utökat `about`. Billigt, och den "FAQ"-
motsvarighet hollr.at har.

## Leverans-skiss (när beslutad)
SQL: `delete_own_account()` RPC (grant/revoke som övriga) + ägarskaps-hanteringen ·
`AuthAdapter.deleteAccount?()` + Supabase-impl · `userdel`-kommando m. bekräftelse ·
`man privacy` · tester (Memory: flödet; bekräftelse krävs) · changelog. Cutta som
en minor.

_Ny idé, scopad 2026-08-08. Följer `roadmap/README.md`._
