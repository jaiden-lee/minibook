import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(currentDir, "./src"),
      "@minibook/shared-types": resolve(currentDir, "../packages/shared-types/src/index.ts"),
      "@minibook/sync-core": resolve(currentDir, "../packages/sync-core/src/index.ts"),
      "@minibook/drive-client": resolve(currentDir, "../packages/drive-client/src/index.ts"),
    },
  },
});
