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
- `shared_list_invites` keyas på e-post, inte user_id → RPC:n raderar även invites
  *adresserade till din e-post* (annars kan ett nytt konto med samma mejl claima).
- `shared_lists.created_by` → `on delete set null` (listan överlever).
- **`notifications.body`** bäddar in inbjudarens e-post (`notify_on_invite`) i
  *mottagarens* rad → cascade:ar inte. RPC:n scrubbar din e-post → 'someone'.
- **Lås-ordning:** lista-rader → auth-rad (samma som `claim_invites`), annars
  deadlock som kan avbryta raderingen.

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

## Beslut (låsta 2026-08-08)
1. **Auth-radering: RPC.** `SECURITY DEFINER delete_own_account()` (ägd av
   postgres) kör `delete from auth.users where id = auth.uid()` — auth:s
   barntabeller + all app-data cascade:ar. Anropbar från browsern som övriga
   RPC:er; ingen Edge Function.
2. **Ensam-ägda listor: auto-promota.** Före auth-raderingen: för varje lista där
   anroparen är ende ägare *och* andra medlemmar finns → befordra en deterministisk
   kvarvarande medlem (lägsta user_id) till owner. Inga andra medlemmar → listan
   får cascade:a bort (created_by → null, medlemsrad borta = tom lista städas).
   Detta är Slice B-frö:t (auto-promote) och stänger orphan-caset.
3. **Bekräftelse: skriv om namnet.** `userdel` ensamt → varning + "kör `userdel
   <ditt-användarnamn>` för att bekräfta". `userdel <namn>` där `namn ===
   session.user` → kör. En-shot, ingen interaktiv prompt behövs (namnet är
   argumentet). Alias `deluser`.

## Leverans (redo att bygga)
- **SQL** (`supabase/account.sql` eller i schema): `delete_own_account()` RPC med
  auto-promote-loopen + `delete from auth.users …`; grant `authenticated`, revoke
  `public, anon`. Körs manuellt i Supabase SQL-editorn (som övriga).
- **Seam:** `AuthAdapter.deleteAccount?(): Promise<void>` (valfri); `Supabase`
  anropar RPC:n + `signOut`; `Memory`/`Fake` no-op/stub så testerna driver flödet.
- **Kommando:** `userdel` (alias `deluser`) — inloggad-only; namn-bekräftelse;
  på klart → `deleteAccount` → `reloadFs` → guest, "account deleted".
- **`man privacy`** (ärlig: vad som lagras, *och* Cloudflare Web Analytics på
  live-sajten — cookie-fri, aggregerad, ingen persondata; ingen på preview/dev) +
  tester (Memory: bekräftelse krävs, fel namn nekas, flödet raderar + nollar VFS:en)
  + changelog-rad. Cutta som en minor.

_Ny idé, scopad + beslutad 2026-08-08. Redo att bygga._
