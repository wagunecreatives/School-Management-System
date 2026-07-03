export const DEFAULT_SITE_NAME = "Santa Ana Calm Waters Academy";
export const DEFAULT_DESCRIPTION =
  "School Management System for Santa Ana Calm Waters Academy — students, fees, results.";

// Used when no og image is provided by a page.
export const DEFAULT_OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e11a39a3-0b35-4b1f-a497-aa248b23ce66/id-preview-3cf32dc2--f2dabbb8-33eb-4322-9432-e691fdfbc4f6.lovable.app-1781099105061.png";

export function makeCanonicalUrl(pathname: string) {
  // SSR: use SITE_URL; Browser: use location.origin.
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : process.env.SITE_URL ?? "";

  const cleanOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${cleanOrigin}${cleanPath}`;
}

