---
title: Lazy email verification (gate claim, not signup)
status: next
tags: [auth, share]
updated: 2026-08-08
order: 5
---

## Mål
Behåll den friktionsfria terminal-signup:en (`useradd` loggar in direkt, inget
mejlhopp) **och** stäng invite-kapningshålet: en delning adresserad till en
e-post ska bara kunna accepteras av någon som bevisligen kontrollerar den
inkorgen. Vi verifierar **lat** — exakt när det först spelar roll (att claima en
delning), aldrig i förväg.

## Bakgrund / varför
Supabase-projektet har **"Confirm email" AV** (medvetet — se
`shared-file-roles.md` och signup-UX:en). Effekten: `signUp` ger session direkt
och `email_confirmed_at` sätts alltid → adressen är i praktiken **overifierad**.
Hela delningsmodellen litar dock på just e-posten:

```sql
-- claim_invites():
v_email := lower(auth.jwt() ->> 'email');
-- ... gör om alla shared_list_invites med den e-posten till medlemskap
```

Hål: registrerar någon `victim@x` (utan att äga adressen) och en ägare kör
`todo share lista victim@x`, så claimar spoofaren delningen vid nästa boot.

**Nyckelinsikt:** verifiering behöver *inte* gate:a inloggning eller personligt
bruk — bara **claim** (och ev. att bjuda in). Därför kan friktionsfriheten vara
kvar överallt annars. Supabases inbyggda confirm förblir **AV** (den skulle
blockera sessionen igen); vi lägger ett eget, lat lager ovanpå.

## Hur det funkar

### Signup — oförändrat
`useradd piaowner … pw` → konto skapat, inloggad direkt. Enda tillägget en dim
rad:
```
account created — logged in as piaowner
tip: run `verify` to confirm your email (needed to accept lists shared with you)
```

### Invite — två fall
- **A. Inbjuden klickar den brandade länken (tänkta flödet):** oförändrat.
  Länksessionen bevisar inkontroll → markeras **auto-verifierad** vid boot →
  inviten auto-claimas → listan dyker upp. Noll extra steg.
- **B. Har redan ett lösenordskonto på adressen, klickade aldrig länken:** vid
  `shared`/reload ser de nudgen istället för tyst claim:
  ```
  1 list was shared with pia-viewer-durable@… — run `verify` to accept it
  ```
  `verify` → brandad engångskod → `verify <kod>` bevisar inkontroll → nästa
  claim går igenom. Den lilla friktionen **är** säkerhetsgränsen, och drabbar
  bara den som inte kom via länken.

## Implementation

### 1. Supabase-migration (`supabase/email_verification.sql`)
Server-betrodd flagga som användaren **inte** kan sätta själv (därför inte
`user_metadata`, som är användar-skrivbar):

```sql
create table if not exists public.email_verifications (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);
alter table public.email_verifications enable row level security;
-- Läs egen rad (klienten visar verifierad-status). Ingen write-policy = inga
-- direkta skrivningar; bara definer-funktionen nedan skriver.
create policy "read own verification" on public.email_verifications
  for select using (user_id = auth.uid());

-- Bevis = NUVARANDE session föddes ur ett mejlat länk/kod (amr), inte bara
-- lösenord. amr-form bekräftad mot en riktig JWT:
--   [{"method":"password","timestamp":1786172313}]
-- OTP/magic-link-sessioner bär method 'otp' (äldre builds: 'magiclink') — vi
-- accepterar en mängd för att inte vara sköra på exakt sträng.
create or replace function public.confirm_email_control()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
    where e ->> 'method' in ('otp','magiclink','email','email_otp')
  ) then
    raise exception 'email control not proven — sign in via the emailed link/code';
  end if;
  insert into public.email_verifications (user_id)
    values (auth.uid()) on conflict (user_id) do nothing;
end $$;
revoke execute on function public.confirm_email_control() from public, anon;
grant execute on function public.confirm_email_control() to authenticated;

-- Grandfathera befintliga konton så de inte plötsligt låses ute från claim.
insert into public.email_verifications (user_id)
  select id from auth.users on conflict (user_id) do nothing;
```

Och **en enda guard** överst i `claim_invites()` (resten av kroppen orörd):
```sql
  if v_uid is null or v_email is null then return 0; end if;
  -- NY: overifierad e-post claimar ingenting (delnings-trust-roten).
  if not exists (select 1 from public.email_verifications where user_id = v_uid)
  then return 0; end if;
```

### 2. Auth-adapter (`src/supabase/auth.ts`)
- `register()` fortsätter returnera session (confirm av).
- `sendEmailCheck()` → `signInWithOtp({ email, options:{ shouldCreateUser:false }})`
  (brandad kod, samma SMTP som invite).
- `submitEmailCheck(code)` → `verifyOtp({ email, token:code, type:'email' })`
  → sen `rpc('confirm_email_control')`.
- `isEmailVerified()` → `select` mot `email_verifications`.
- Vid boot efter en OTP-landning: best-effort `confirm_email_control()`
  **före** `claim` (auto-verifierar fall A).

### 3. Kommando (`src/commands/auth.ts`)
Nytt `verify` (alias `confirm`): `verify` skickar kod, `verify <kod>` löser in →
"email verified ✓". `useradd`-hinten ovan. **Idiom-not:** `verify` saknar
Unix-motsvarighet — accepterad web-auth-divergens, samma familj som
email+password+bekräftelse-flödet. Flagga i `CLAUDE.md`.

### 4. Boot (`src/main.ts`)
I claim-blocket: kör `confirm_email_control()` först (fångar länk-landningar);
finns pending invites för min e-post men jag är overifierad → skriv nudgen
istället för tyst claim.

### 5. UI-bonus
Visa verifierad-status i `whoami` och `todo members` (gör medlemslistan mer
trovärdig).

## Risker / avvägningar
- **Fler rörliga delar** (tabell + RLS + 2 definer-funktioner + kommando + boot +
  tester + tour) mot dagens "av, klart".
- **`amr`-beroendet.** Vi litar på GoTrues amr-claim. Struktur + `password`-label
  bekräftade live; **exakt OTP-sträng kvar att pinna mot en riktig OTP-JWT**
  (blockerades i testsessionen av AgentMail-approval). Whitelist-mängden mildrar,
  men kör en gång: `signInWithOtp` → `verifyOtp` → dumpa `jwt.amr`.
  *Alternativ som slipper amr helt:* per-invite-token (slumptoken i invite-raden
  + i länken, claim kräver token) — men mer plumbing i mejl/redirect och täcker
  bara invite-hålet, inte en återanvändbar verifierad-status.
- **Ett extra steg för lösenordskonto-som-bjuds-in** (oftast osynligt — de kommer
  via länken ändå).
- **Mejlleverans blir bärande för en säkerhetsväg** (SMTP-avbrott = kan inte
  verifiera = kan inte claima). Custom SMTP testad OK.
- **Grandfathering får inte glömmas** (backfill-raden).
- **Två "confirmed"-sanningar**: Supabases `email_confirmed_at` (alltid satt,
  meningslös här) vs vår `email_verifications`. Dokumenteras.

## Vad vi vinner / missar
**Vinner:** stänger spoof-/invite-kapningshålet där det spelar roll; friktionsfri
signup + solo-bruk 100 % kvar; lat verifiering; primära invite-vägen känns
oförändrad; en riktig verifierad-status att visa. **Missar (medvetet):** inte
"verifierad vid signup" — ett konto kan köra med en adress det inte äger, det kan
bara inte *ta emot delningar* dit. Vill man blockera själva registreringen krävs
confirm-vid-signup (det hårda stoppet vi undviker). Roller/read-only berörs inte
(sitter på `user_id` + RLS, redan solida) — scope hålls smalt.

## Öppna frågor
- Ska `invite_to_list` kräva att **avsändaren** är verifierad? (v1: nej — delning
  gate:as redan av list-ägarskap; verifiering gate:ar mottagarsidan/claim.)
- `verify` via **kod** (`verify 483920`, stannar i prompten — mest terminal-nativt)
  vs **länk** (klick lämnar terminalen men auto-verifierar). Luta åt kod.
- Pinna exakt `amr`-method-sträng för OTP mot v2.195 GoTrue innan release.
- Ev. utgångstid på verifiering (om man vill kunna av-verifiera vid e-postbyte).
