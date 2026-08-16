import { BRAND } from "@/lib/branding";

/**
 * The deployment's isotype.
 *
 * The shape itself lives in `BRAND.logoPath` rather than here, so a
 * client instance swaps its own mark in through the environment
 * without touching this component. The default is Motib's moon,
 * extracted as vector from the 2026 brand manual.
 *
 * Inherits `currentColor`. Callers pair it with `BRAND.mark` colors so
 * the logo renders identically to the favicon and, like any real
 * product logo, does not recolor when the user changes accent theme.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={BRAND.logoPath} />
    </svg>
  );
}
