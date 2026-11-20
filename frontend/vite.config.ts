import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],
    base: "/",
    publicDir: "public",
    build: {
      outDir: "dist",
      target: "esnext",
      chunkSizeWarningLimit: 1000,
    },
    server: {
      proxy: {
        "/api": env.VITE_API_URL,
      },
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
  };
});
