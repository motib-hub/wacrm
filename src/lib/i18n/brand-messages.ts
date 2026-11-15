import { BRAND } from '@/lib/branding';

/**
 * Put this deployment's brand into the upstream message catalogues.
 *
 * Upstream ships its UI copy in `messages/<locale>.json` and names the
 * product in two ways: the literal `wacrm` inside running prose, and a
 * localized product title (`Sidebar.title`, e.g. "CRM Template for
 * WhatsApp" / "Plantilla de CRM para WhatsApp") that is reused in other
 * strings such as the signup subtitle. This fork is white-labelled
 * (`src/lib/branding.ts`), so both have to read as `BRAND.name`.
 *
 * Doing it here, once, at catalogue load — instead of editing the JSON
 * files or threading a `{brand}` argument through every `t()` call — is
 * deliberate: the catalogues stay byte-identical to upstream, so the
 * next upstream sync does not conflict on them, and a string upstream
 * adds tomorrow is branded without anyone remembering to.
 *
 * Applied in both catalogue entry points: `src/i18n/request.ts`
 * (components, via next-intl) and `src/lib/i18n/translate.ts` (route
 * handlers and shared validators).
 */

type Catalogue = Record<string, unknown>;

const UPSTREAM_NAME = /\bwacrm\b/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapStrings(node: unknown, fn: (s: string) => string): unknown {
  if (typeof node === 'string') return fn(node);
  if (Array.isArray(node)) return node.map((n) => mapStrings(n, fn));
  if (node && typeof node === 'object') {
    const out: Catalogue = {};
    for (const [k, v] of Object.entries(node)) out[k] = mapStrings(v, fn);
    return out;
  }
  return node;
}

export function applyBrandToMessages<T extends Catalogue>(
  messages: T,
  brand: { name: string; description: string } = BRAND,
): T {
  const sidebar = messages.Sidebar as Catalogue | undefined;
  const productTitle =
    typeof sidebar?.title === 'string' && sidebar.title.trim()
      ? new RegExp(escapeRegExp(sidebar.title), 'g')
      : null;

  const branded = mapStrings(messages, (s) => {
    let out = s.replace(UPSTREAM_NAME, brand.name);
    if (productTitle) out = out.replace(productTitle, brand.name);
    return out;
  }) as Catalogue;

  const metadata = branded.Metadata as Catalogue | undefined;
  if (metadata && typeof metadata.description === 'string') {
    metadata.description = brand.description;
  }
  return branded as T;
}
