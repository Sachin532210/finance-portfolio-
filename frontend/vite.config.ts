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
    chunkSizeWarningLimit: 1200,
  },
});
