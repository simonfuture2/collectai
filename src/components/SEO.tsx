import { Helmet } from "react-helmet-async";

const SITE_URL = "https://mycollectai.com";
const DEFAULT_OG_IMAGE =
  "https://storage.googleapis.com/gpt-engineer-file-uploads/JZx857dg1wZk7DNNlgZf62ZfnzR2/social-images/social-1772043147642-collectai_logo-removebg-preview.webp";

interface SEOProps {
  title: string;
  description: string;
  path: string;
  ogType?: "website" | "article" | "product";
  image?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noIndex?: boolean;
}

const SEO = ({ title, description, path, ogType = "website", image = DEFAULT_OG_IMAGE, jsonLd, noIndex }: SEOProps) => {
  const url = `${SITE_URL}${path}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={image} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
};

export default SEO;
