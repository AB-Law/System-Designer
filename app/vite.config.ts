import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // when the optional FastAPI backend runs on :8000, the dev server forwards /api to it
  server: { proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
