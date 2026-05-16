// Generates public/sitemap.xml from the app's public route list. Runs predev/prebuild.
import { writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://mycollectai.com";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://irncxwszrawrndsdaqel.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybmN4d3N6cmF3cm5kc2RhcWVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2OTYwMTYsImV4cCI6MjA4MjI3MjAxNn0.fK4HpBZySrtolmwmfxQAz9k1kR9mR7CUb80zRj9cDzY";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/how-it-works", changefreq: "monthly", priority: "0.8" },
  { path: "/pricing", changefreq: "monthly", priority: "0.9" },
  { path: "/marketplace", changefreq: "daily", priority: "0.9" },
  { path: "/faq", changefreq: "monthly", priority: "0.7" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/partners", changefreq: "monthly", priority: "0.6" },
  { path: "/free-guide", changefreq: "monthly", priority: "0.6" },
  { path: "/install", changefreq: "monthly", priority: "0.5" },
  { path: "/auth", changefreq: "yearly", priority: "0.4" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/refund", changefreq: "yearly", priority: "0.3" },
  // Note: /scan, /dashboard, /collection, /pack-rip, /achievements, /wallets,
  // /card/:id, /marketplace/list/:cardId, /checkout/* are user-private (noindex)
  // and intentionally omitted from the sitemap.
];

async function fetchDynamicEntries(): Promise<SitemapEntry[]> {
  const dynamic: SitemapEntry[] = [];
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Active marketplace listings — publicly browsable detail pages.
    const { data: listings } = await supabase
      .from("marketplace_listings")
      .select("id")
      .eq("status", "active")
      .limit(5000);
    for (const l of listings ?? []) {
      dynamic.push({ path: `/marketplace/${l.id}`, changefreq: "daily", priority: "0.7" });
    }

    // Public collector profiles.
    const { data: profiles } = await supabase
      .from("profiles")
      .select("public_collection_slug")
      .eq("public_collection_enabled", true)
      .not("public_collection_slug", "is", null)
      .limit(5000);
    for (const p of profiles ?? []) {
      if (p.public_collection_slug) {
        dynamic.push({ path: `/u/${p.public_collection_slug}`, changefreq: "weekly", priority: "0.5" });
      }
    }
  } catch (err) {
    console.warn("sitemap: skipping dynamic entries —", (err as Error).message);
  }
  return dynamic;
}

const entries: SitemapEntry[] = [...staticEntries, ...(await fetchDynamicEntries())];

const xml = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ...entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ].filter(Boolean).join("\n")
  ),
  `</urlset>`,
].join("\n");

writeFileSync(resolve("public/sitemap.xml"), xml);
console.log(`sitemap.xml written (${entries.length} entries)`);
