/**
 * Single source of truth for the deployment's brand identity.
 *
 * This fork is white-labelled: one codebase, one brand per deployment.
 * The Motib instance calls itself "MOTIB CRM"; a client instance sets
 * `NEXT_PUBLIC_BRAND_NAME=SPF CRM` in its own environment and every
 * user-facing surface follows — sidebar, auth screens, browser title,
 * favicon, invitation emails, settings copy.
 *
 * The rule this module exists to enforce: NEVER hard-code a brand name
 * in a component. Import `BRAND` instead. The day this moves from
 * per-deployment (env) to per-account (a `brand_name` column on
 * `accounts`, the GoHighLevel-style agency model), only this file's
 * internals change — every consumer keeps working untouched.
 *
 * Why plain `process.env.X || fallback` and not a helper that takes a
 * key: Next.js inlines `NEXT_PUBLIC_*` at build time by textual
 * substitution on literal member access. `process.env[key]` is NOT
 * substituted and silently reads `undefined` in the browser bundle.
 * Every read below has to stay spelled out.
 */

/** Empty / whitespace-only env vars are treated as "not set". */
function orDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * The reselling agency shown as a discreet signature under the client's
 * own brand ("por Motib" in the sidebar footer, a line in invitation
 * messages). This is the co-branding half of white-labelling: the
 * client's team sees *their* CRM, and sees who provides it.
 *
 * Set `NEXT_PUBLIC_BRAND_AGENCY_NAME=""` to remove the signature
 * entirely (a client who bought the deployment outright).
 */
const agencyName = orDefault(
  process.env.NEXT_PUBLIC_BRAND_AGENCY_NAME,
  "Motib",
);

export const BRAND = {
  /**
   * The product name, used verbatim everywhere it appears — headings
   * and running prose alike. Deliberately ONE field: a separate
   * "display name" and "prose name" drift apart within a release.
   */
  name: orDefault(process.env.NEXT_PUBLIC_BRAND_NAME, "MOTIB CRM"),

  description: orDefault(
    process.env.NEXT_PUBLIC_BRAND_DESCRIPTION,
    "WhatsApp CRM — shared inbox, contacts, pipelines and automations.",
  ),

  /**
   * Public origin of this deployment. Reused as the last-resort base
   * for invitation links when no request headers are available (see
   * `src/app/api/account/invitations/route.ts`).
   */
  url: orDefault(
    process.env.NEXT_PUBLIC_SITE_URL,
    "https://crm.motibhub.com.ar",
  ),

  /**
   * Default accent theme id (see `src/lib/themes.ts`). Users can still
   * pick another in Settings → Appearance; this is only what a fresh
   * browser sees. Validated in themes.ts — an unknown id there falls
   * back rather than rendering an unstyled app.
   */
  defaultTheme: orDefault(process.env.NEXT_PUBLIC_BRAND_THEME, "motib"),

  /**
   * Logo colors. Hex, not CSS variables, on purpose: the favicon is
   * rendered to a PNG by `src/app/icon.tsx`, where no stylesheet
   * exists to resolve `--primary` against — and the two surfaces have
   * to match exactly.
   *
   * Defaults reproduce the official Motib app icon from the 2026 brand
   * manual: the isotype in off-white on an ink squircle. Deliberately
   * NOT tied to the accent theme — a logo keeps its colors when the
   * user switches accent, the way it does in any real product.
   */
  mark: {
    background: orDefault(
      process.env.NEXT_PUBLIC_BRAND_MARK_BG,
      "#1a1a1a",
    ),
    foreground: orDefault(
      process.env.NEXT_PUBLIC_BRAND_MARK_FG,
      "#f2f2f2",
    ),
  },

  /**
   * The isotype, as an SVG path on a 24x24 viewBox.
   *
   * The default is Motib's own mark — the moon — lifted verbatim as
   * vector from page 14 ("Favicon / Logo") of the 2026 brand manual,
   * not redrawn. A client deployment MUST override this: shipping
   * "SPF CRM" under Motib's moon would be wrong. Supply the client's
   * mark as a single path normalised to the same 24x24 box.
   */
  logoPath: orDefault(
    process.env.NEXT_PUBLIC_BRAND_LOGO_PATH,
    "M12.318 23.79C10.116 23.79 8.052 23.186 6.286 22.137C5.364 21.588 5.407 20.249 6.328 19.699C11.772 16.452 15.924 11.181 18.356 4.398C18.707 3.42 19.971 3.117 20.693 3.865C22.739 5.981 24 8.868 24 12.045C24 18.521 18.76 23.79 12.318 23.79ZM10.587 0.21C4.74 0.21 -0 4.95 -0 10.798C-0 16.645 4.74 21.385 10.587 21.385C16.435 21.385 21.175 16.645 21.175 10.798C21.175 4.95 16.435 0.21 10.587 0.21Z",
  ),

  /** `null` when the signature is switched off — check before rendering. */
  agency: agencyName
    ? {
        name: agencyName,
        url: orDefault(
          process.env.NEXT_PUBLIC_BRAND_AGENCY_URL,
          "https://www.motibhub.com.ar",
        ),
      }
    : null,
} as const;
