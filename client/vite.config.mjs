import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  server: {
    // 0.0.0.0 so phones on the same Wi‑Fi can open the LAN URL (QR pairing).
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/uploads": "http://127.0.0.1:4000",
    },
  },
  build: {
    outDir: resolve(__dirname, "../server/public"),
    emptyOutDir: true,
  },
});
