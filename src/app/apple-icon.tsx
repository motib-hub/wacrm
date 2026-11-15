import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/branding";

// Home-screen icon for iOS ("Add to Home Screen") — fork addition.
//
// Same mark and colors as `icon.tsx`, but full-bleed: iOS applies its
// own rounded mask to home-screen icons, so drawing a squircle here
// would leave a visible inner border. 180x180 is the size iOS asks for.
// The web manifest (`manifest.ts`) reuses this route for Android.

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${BRAND.logoPath}" fill="${BRAND.mark.foreground}"/></svg>`;
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
          background: BRAND.mark.background,
        }}
      >
        <img src={markSrc} alt="" width={108} height={108} />
      </div>
    ),
    { ...size },
  );
}
