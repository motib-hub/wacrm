# This fork (motib-hub/wacrm)

Fork of [ArnasDon/wacrm](https://github.com/ArnasDon/wacrm), kept close
to upstream on purpose: every upstream sync should be a merge, not a
rewrite. This page is the map of what the fork adds and the rules that
keep the next sync cheap.

## What the fork adds

| Feature | Where | Migration |
|---|---|---|
| White-label brand (one brand per deployment) | `src/lib/branding.ts`, `src/lib/i18n/brand-messages.ts` | — |
| WhatsApp Coexistence (Business app + Cloud API on one number) | `src/lib/whatsapp/coexistence.ts`, `POST /api/whatsapp/config/sync` | 031 |
| Click-to-WhatsApp ad attribution | `src/lib/whatsapp/referral.ts` | 032 |
| Lead sources for non-ad origins (wa.me prefill) | `src/lib/whatsapp/lead-source.ts`, Settings → Lead sources | 033 |
| One conversation per contact (fixed in parallel with upstream 036) | `src/lib/whatsapp/resolve-conversation.ts` (upstream version kept) | 034 |
| Per-account Meta app secret | `lookupAppSecret` in the webhook, `webhook-signature.ts` | 035 |
| Instagram Direct + Lead Ads | `src/lib/instagram`, `src/lib/lead-ads`, `src/lib/meta` | 036 |
| Automation conditions `two_way_conversation`, `arrived_from_ad`; one open deal per contact and pipeline | `src/lib/automations/engine.ts`, `validate.ts` | — |
| **Marcas** — agency workspace: brands, task board, own team membership (`admin` / `equipo`) | `src/lib/marcas`, `src/components/marcas`, `src/app/(dashboard)/marcas`, `src/hooks/use-marcas-member.ts`; seams in `sidebar.tsx`, `dashboard-shell.tsx`, `middleware.ts` | 059_motib_marcas |

### Marcas in one paragraph

Marcas does not use CRM accounts at all: `marcas_members` is its own
roster, so a teammate who only works brands signs up (getting the empty
personal account every CRM user gets), is added there as `equipo`, and
from then on sees only `/marcas` — the nav shows nothing else and the
shell redirects any other route. Security is RLS (`marcas_role()`,
`marcas_can_see_brand()`); the redirect is only navigation. Brands
flagged `team_visible` are the ones `equipo` sees. The repo is public,
so brands, members and tasks are never seeded here — they are loaded
from a private SQL file.

## Rules

1. **Never hard-code a product name.** Components import `BRAND`; the
   upstream catalogues in `messages/*.json` stay byte-identical and are
   branded at load time by `applyBrandToMessages`.
2. **Don't edit upstream catalogues except to add fork keys.** Fork-only
   strings go next to the upstream ones in all four locales.
3. **Fork migrations carry `motib` in the name** and take the number of
   the latest upstream migration when they are written, so they sort
   after it: `036_motib_upstream_sync_prep.sql`,
   `059_motib_redeem_invitation_fork_tables.sql`. The six fork files
   from before this rule (`031`–`036` without `motib`) keep their names
   because code comments and the live DB history refer to them.
4. **A fork module lives in its own folders** (`src/lib/<module>`,
   `src/components/<module>`, `src/app/(dashboard)/<module>`) and
   touches shared files only at a single, commented seam.
5. **Tests are the tripwire for upstream drift.** When upstream adds a
   check that a fork table fails (e.g. `redeem-invitation-migration`),
   fix the fork, not the test.

## Syncing upstream

```bash
git fetch upstream
git checkout -b chore/sync-upstream-<date> main
git merge upstream/main
# resolve, then:
npx tsc --noEmit && npx vitest run && npx eslint src --quiet && npm run build
```

Then apply the new upstream migrations to the live database **in file
order, before deploying the code** — the new code expects the new
columns and functions. Check every new upstream migration for objects
with the same name as a fork migration's (the 2026-11 sync found a
plain index in fork 031 that would have blocked upstream 037's unique
index and broken every inbound message insert).

### Sync log

| Date | Upstream | Notes |
|---|---|---|
| 2026-09-03 | security fixes only (cherry-picked) | 8 advisories |
| 2026-11-15 | `c81299d` (383 commits) | i18n, BSUID identities, idempotent inbound, authz fixes; prep migration 036_motib; app secret now survives a blank re-save |
