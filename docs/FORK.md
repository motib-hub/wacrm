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
| **Marcas · Contenido** — the brand's content plan, read live from its "Planificación" sheet and the Drive folders it links | `src/lib/marcas/content`, `src/lib/marcas/google`, `src/components/marcas/content`, `GET /api/marcas/content`; CSP `frame-src` seam in `next.config.ts` | 059_motib_marcas_integrations |
| **Marcas · Resumen** — dashboard: Instagram planned vs. published per brand and day, today, missing material for the next 7 days, tasks due | `src/lib/marcas/instagram`, `src/lib/marcas/summary.ts`, `src/components/marcas/summary`, `/marcas/resumen`, `GET /api/marcas/instagram`, `POST /api/marcas/instagram/sync` + `.github/workflows/marcas-instagram.yml` | 059_motib_marcas_published_instagram |
| **Motib HUB** — the agency team (Marcas members) sees the app as the hub: "MOTIB HUB" wordmark and a sidebar of modules that fold open (MARCAS → Clientes, Tareas; CRM → upstream's whole nav, read from its list, so new upstream sections appear on their own). Client accounts keep upstream's flat nav and "MOTIB CRM" | `src/lib/hub`, `src/components/hub`, `BRAND.hub`, `/marcas/tareas`, `/marcas/contenido` (every brand's content together, same `GET /api/marcas/content` per brand), section list in `src/lib/marcas/sections.ts`; seams in `sidebar.tsx` (nav + wordmark) | — |

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

### Resumen (Instagram planned vs. published)

`marcas_brands.instagram_username` links a brand to its account. Meta is
read as a business **system user** of Motib's portfolio that each client
shares its Page + Instagram with as a partner (read scopes only:
`instagram_basic`, `instagram_manage_insights`, `pages_show_list`,
`pages_read_engagement`, `ads_read`). Its token and the scheduled sync's
secret are kept encrypted in `marcas_integrations` (id `meta`,
`{"token","cronSecret"}`). Stories vanish from the API after 24 h, so a
GitHub Actions schedule calls `POST /api/marcas/instagram/sync` twice a
day (secrets `MARCAS_SYNC_URL`, `MARCAS_SYNC_SECRET`) and the summary
also refreshes, throttled, when opened. Only ids, type, time and
permalink are stored (`marcas_ig_media`); `marcas_ig_sync.first_at`
marks from when stories can be judged (earlier days show "?", not 0).
Days are Argentina's (UTC−3). Publishing never goes through the CRM.

### Contenido (how the board stays in sync without storing anything)

Nothing visual is stored. `GET /api/marcas/content` checks the brand
with the caller's session (RLS), then reads, as a read-only Google
service account kept encrypted in `marcas_integrations`, only the month
tabs that overlap the requested window, finds columns by header text
(templates differ per brand), and lists the Drive folder each "Pieza"
cell links to. Thumbnails are Google's signed URLs loaded straight by the
browser; videos play in Drive's own player. A 60 s per-instance cache
absorbs the board's 90 s auto-refresh. A row the robot can't open shows
as missing material instead of failing the board. The robot reads files
shared with it or shared "anyone with the link".

Two sources are merged (`src/lib/marcas/content/merge.ts`): the sheet
(what is planned) and the brand's Instagram folder, `marcas_brands.drive_url`
(what exists). The folder follows one layout for every client:

```
NN_Instagram/                     (number follows the client's own folders)
  Planificación - MARCA           (the sheet)
  Feed/    11. Noviembre/  18-11. Título/      one folder per piece
  Stories/ 11. Noviembre/  18-11. 01.jpg       or a "18-11" folder
```

Motib's stories (`Stories/2026-11-16 lunes/`) are read as well. A row's
own link wins; a dated feed row without a link takes that day's folder;
unclaimed feed folders show as "not in the plan"; each day's stories
become one strip, minus files a row already links.

Stories with a sticker can't go out through the API, so the team names
them `… - CON STICKER.jpg` and leaves a `QUE SUBIR.txt` in the day's
folder (`src/lib/marcas/content/manual.ts`). The card flags them as
manual, the dialog shows the cleaned instructions, and
`GET /api/marcas/content/file` hands over the image (images only, and
only from inside that brand's Drive folder) so nobody opens Drive.

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
