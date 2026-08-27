import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The backend runs on 8010 because another application on this machine
// already occupies port 8000. Requests are proxied so the browser sees a
// single origin - that keeps the httpOnly session cookie working without
// any cross-site cookie configuration.
const API_TARGET = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8011";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/health": { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Split the heavy vendors out of the entry chunk. Charting is the big one
    // and is only needed on pages that draw graphs, so it should not sit in
    // the critical path for the login screen.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-switch",
          ],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
