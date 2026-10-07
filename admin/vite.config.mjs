import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Built into site/admin and served by Pages next to the API (same origin, no CORS, no dev proxy).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/admin/",
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL("../site/admin", import.meta.url)), emptyOutDir: true },
});
