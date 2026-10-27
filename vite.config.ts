import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  // Works both at the GitHub Pages project prefix and in standalone exports.
  base: "./",
  plugins: [react()],
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
