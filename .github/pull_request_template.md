<!--
  A layout to fill in, not rules to obey — delete anything that doesn't apply.
  PIA convention: prose in English; keep it short and readable.
-->

## What & why

<!-- One or two sentences: what this changes and the reason for it. -->

## How it works

<!-- The user-facing behaviour, or the mechanism if it's internal. Note any
     terminal-idiom decisions or accepted web divergences (see CLAUDE.md). -->

## Screenshots

<!-- Tests check output/behaviour, not pixels — attach a browser shot for any
     colour/font/layout change. Delete this section otherwise. -->

## Checklist

- [ ] `npm run typecheck && npm test && npm run build` pass
- [ ] Tour golden updated if behaviour changed (`npx vitest -u`, diff reviewed)
- [ ] `CHANGELOG.md` has an `[Unreleased]` line (grouped: Added / Changed / Fixed / …), or this is internal-only churn
- [ ] Version rolled if release-worthy (`package.json` + changelog section + tag after merge)

## Deploy / migration notes

<!-- Anything that must happen beyond merging: a `supabase/*.sql` to apply (and
     in what order relative to this client), an env var, a tag/release. Write
     "none" if it just ships with the next Cloudflare Pages build. -->
