import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(currentDir, "./src"),
      "@minibook/shared-types": resolve(currentDir, "../packages/shared-types/src/index.ts"),
      "@minibook/sync-core": resolve(currentDir, "../packages/sync-core/src/index.ts"),
    },
  },
});
