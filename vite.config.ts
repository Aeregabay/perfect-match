import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: "dist", sourcemap: false, target: "es2022", assetsInlineLimit: 0 },
  server: { port: 5173 },
});
