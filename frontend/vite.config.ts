import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  publicDir: "public",
  build: {
    outDir: "dist",
    target: "esnext",
    // 3B sahne (three.js) ayrı ve tembel yüklenen bir parça; ~950 kB olması beklenen bir durum
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Geliştirme sırasında /api isteklerini Flask'a yönlendirir (CORS gerekmez)
    proxy: {
      "/api": "http://127.0.0.1:5000",
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
