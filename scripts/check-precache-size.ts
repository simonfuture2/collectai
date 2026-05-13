/**
 * Post-build check: fails clearly when any asset that the PWA service worker
 * would precache exceeds the Workbox `maximumFileSizeToCacheInBytes` limit.
 *
 * Reads the limit from vite.config.ts (workbox.maximumFileSizeToCacheInBytes),
 * defaults to 2 MiB (Workbox default) when not configured.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const DEFAULT_LIMIT = 2 * 1024 * 1024;
// Mirror vite.config.ts workbox.globPatterns
const PRECACHE_EXT = /\.(js|css|html|ico|png|svg|woff2)$/i;

function readConfiguredLimit(): number {
  try {
    const cfg = readFileSync("vite.config.ts", "utf8");
    const m = cfg.match(/maximumFileSizeToCacheInBytes\s*:\s*([^,\n}]+)/);
    if (!m) return DEFAULT_LIMIT;
    // eslint-disable-next-line no-new-func
    return Number(new Function(`return (${m[1].trim()})`)());
  } catch {
    return DEFAULT_LIMIT;
  }
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function fmt(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

try {
  statSync(DIST);
} catch {
  console.log(`[precache-check] No ${DIST}/ directory; skipping.`);
  process.exit(0);
}

const limit = readConfiguredLimit();
const offenders: { path: string; size: number }[] = [];

for (const file of walk(DIST)) {
  if (!PRECACHE_EXT.test(file)) continue;
  const size = statSync(file).size;
  if (size > limit) offenders.push({ path: file, size });
}

if (offenders.length === 0) {
  console.log(`[precache-check] OK — no assets exceed ${fmt(limit)}.`);
  process.exit(0);
}

console.error(
  `\n[precache-check] FAIL — ${offenders.length} asset(s) exceed the Workbox precache limit of ${fmt(limit)}:\n`
);
for (const o of offenders.sort((a, b) => b.size - a.size)) {
  console.error(`  - ${o.path}  (${fmt(o.size)})`);
}
console.error(
  `\nFix options:\n` +
    `  1) Reduce bundle size (code-split heavy deps with dynamic import(), set build.rollupOptions.output.manualChunks).\n` +
    `  2) Raise the limit in vite.config.ts: workbox.maximumFileSizeToCacheInBytes.\n` +
    `  3) Exclude the file from precaching via workbox.globIgnores.\n`
);
process.exit(1);
