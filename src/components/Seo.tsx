import { Helmet } from "react-helmet-async";

const SITE_URL = "https://barber.srsoftwarestore.com";
const OG_IMAGE = `${SITE_URL}/pwa-icon-512.png`;

interface SeoProps {
  title: string;
  description: string;
  /** Route path, e.g. "/services". Used for canonical + og:url. */
  path: string;
  /** Optional JSON-LD structured data (object or array of objects). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Per-route SEO head tags. Overrides the static tags in index.html for
 * JS-executing crawlers (Googlebot). Keep titles < 60 chars and
 * descriptions 50–160 chars.
 */
export default function Seo({ title, description, path, jsonLd }: SeoProps) {
  const url = `${SITE_URL}${path}`;
  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={OG_IMAGE} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={OG_IMAGE} />
      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
