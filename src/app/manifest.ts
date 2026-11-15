import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/branding";

// Web app manifest — fork addition. Lets the CRM be installed on a phone's
// home screen and open full-screen, without the browser bars, like a native
// app. The icon is the same route iOS uses (`apple-icon.tsx`).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.hub.lead} ${BRAND.hub.accent}`,
    short_name: `${BRAND.hub.lead} ${BRAND.hub.accent}`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BRAND.mark.background,
    theme_color: BRAND.mark.background,
    icons: [
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
