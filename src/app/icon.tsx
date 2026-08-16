import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/branding";

// Favicon for this deployment — the isotype on the brand squircle,
// matching the sidebar logo in `src/components/brand/brand-mark.tsx`
// and, at the Motib defaults, the official app icon from the 2026
// brand manual.
//
// Colors come from BRAND.mark as raw hex rather than CSS variables:
// this renders through Satori, where no stylesheet exists to resolve
// `--primary` against.
//
// The mark goes in as a data-URI <img> rather than an inline <svg>
// element. Satori's inline-SVG support is partial and varies by
// element; an <img> is decoded by its image pipeline, which handles a
// full path definition reliably.

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${BRAND.logoPath}" fill="${BRAND.mark.foreground}"/></svg>`;
  // btoa is latin1-only; the path is pure ASCII and the colors are hex,
  // so there is nothing here it can choke on.
  const markSrc = `data:image/svg+xml;base64,${btoa(svg)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          background: BRAND.mark.background,
        }}
      >
        <img src={markSrc} alt="" width={21} height={21} />
      </div>
    ),
    { ...size },
  );
}
