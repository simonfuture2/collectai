import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Note: vite-plugin-pwa was removed. A previously generated app service worker
// at /sw.js was caching old chunk hashes and producing "Importing a module
// script failed" / blank-screen errors on the Lovable preview after deploys.
// We now ship a kill-switch worker at public/sw.js that unregisters itself,
// and use a static manifest (public/manifest.webmanifest) for installability.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
