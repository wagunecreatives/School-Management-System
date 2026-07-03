export type SeoMetaInput = {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType?: string;
  ogImageUrl?: string;
};

export function seoMeta(meta: SeoMetaInput) {
  const { title, description, canonicalUrl, ogType = "website", ogImageUrl } = meta;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { rel: "canonical", href: canonicalUrl },

      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: canonicalUrl },
      { property: "og:type", content: ogType },
      ...(ogImageUrl ? [{ property: "og:image", content: ogImageUrl }] : []),

      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      ...(ogImageUrl ? [{ name: "twitter:image", content: ogImageUrl }] : []),
    ],
  };
}

