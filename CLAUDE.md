@AGENTS.md

## Instagram Direct + Lead Ads (migration 036, feat/instagram-and-lead-ads)

Two new inbound channels sit next to WhatsApp, built to land in the
SAME `conversations` / `messages` / `contacts` tables and the SAME
pipeline WhatsApp already uses — not a parallel schema, not a separate
inbox. That's what lets one contact who wrote on Instagram last month
and submits a Lead Ads form today resolve to the same conversation.

**Where each piece lives:**

| Piece | Path |
|---|---|
| Schema | `supabase/migrations/036_instagram_and_lead_ads.sql` |
| Instagram webhook route | `src/app/api/instagram/webhook/route.ts` |
| Lead Ads webhook route | `src/app/api/lead-ads/webhook/route.ts` |
| Instagram referral / message parsing | `src/lib/instagram/*.ts` |
| Lead Ads attribution / Graph API enrichment | `src/lib/lead-ads/*.ts` |
| Shared config lookup (both webhooks) | `src/lib/meta/page-config.ts` |
| Shared webhook idempotency guard | `src/lib/meta/dedupe.ts` |
| Manual connect guide for Tomás | `Herramientas del equipo/wacrm-guia/PASO_11_INSTAGRAM_Y_LEADS.md` (Drive, outside this repo) |

Each new channel reuses, rather than duplicates, a WhatsApp pattern:
per-account app secret (`meta_page_config`, same shape as migration
035's `whatsapp_config.app_secret`), fail-closed signature
verification (`verifyMetaWebhookSignature`, imported directly — it was
already channel-agnostic), `after()` for post-response processing
(same Vercel-freeze hazard as issue #301), and the contact dedupe
helper (`findExistingContact`) for Lead Ads leads that supply a phone.

**Decisiones de diseño que conviene no revertir:**

**`attribution_source_type` stays `'ad'`, never a channel-specific
value.** The automations engine's `arrived_from_ad` condition
(`src/lib/automations/engine.ts`) has been live with real clients
since PR #12 and checks `attribution_source_type === 'ad'` verbatim.
Both new channels write exactly that value — an Instagram DM opened
from a Click-to-Instagram ad, and every Lead Ads submission (the
product doesn't exist without a paid ad) both write `'ad'`, not
`'instagram_ad'` or `'lead_form'`. That's what makes "same pipeline
stage as WhatsApp ad leads" true with **zero changes** to
`engine.ts` — the one file this task was explicitly told to leave
alone unless confirmed first. Which product actually produced the row
is not lost: it's still in `conversations.channel` and in
`attribution_raw` (Instagram's `source`/`ad_id`, or the full leadgen
payload). If a future need ever requires telling "WhatsApp ad" and
"Instagram ad" apart *inside* an automation condition, that's a real
change to `engine.ts` and needs the same confirm-first treatment this
task avoided by design — don't quietly repurpose `attribution_raw`
parsing to fake it instead.

**`contacts.phone` is nullable now.** Instagram gives no phone number,
only an IG-scoped id. The constraint was loosened (migration 036),
never removed — a new `contacts_has_identity` CHECK still requires
`phone OR instagram_id OR email`. Every existing WhatsApp contact
already satisfies `phone IS NOT NULL`, so this is additive: no
WhatsApp code path assumed the NOT NULL besides the schema itself.

**`conversations.channel` reflects who opened the thread, not every
message in it.** A contact who first wrote on WhatsApp and later
submits a Lead Ads form gets the lead-form summary appended to their
*existing* `channel = 'whatsapp'` conversation (found by phone match)
rather than a second, parallel `lead_form` conversation — same person,
one thread, which is the whole point of "same view." The channel
column is therefore a property of the conversation's origin, not a
per-message tag; don't add a `messages.channel` column to "fix" this
without first checking whether it's solving a real problem or just
making the schema busier.

**Flows and AI auto-reply are NOT wired for Instagram or Lead Ads.**
Both are built around WhatsApp's own outbound send path
(`send-message.ts` → Cloud API); wiring them for a second channel is
real, unstarted work (an Instagram Send API client, a channel-aware
dispatch in `flows/engine.ts` and `ai/auto-reply.ts`), not a config
flag. Automations that don't send a message (add a tag, create a
deal, add to pipeline) already work identically on every channel,
because `runAutomationsForTrigger` never looked at how the contact
arrived.

**No settings UI was built for `meta_page_config`.** WhatsApp has
Settings → WhatsApp; Instagram/Lead Ads currently has to be connected
by inserting a row directly (see PASO_11), because `access_token` /
`app_secret` / `verify_token` need the same AES-256-GCM encryption
`whatsapp-config.tsx`'s save handler already does, and building that
form is a separate, sizeable PR of its own — left for whoever picks
up connecting the first real account.

**Lead Ads field matching is name-based (`full_name` / `phone_number`
/ `email`), not positional.** A form builder can reorder or rename
custom questions; only Meta's reserved field names for the built-in
questions are stable. See `src/lib/lead-ads/attribution.ts`.
