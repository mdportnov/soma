import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-logic unit tests run in a Node environment — none of the covered modules
// touch the DOM or the Tauri runtime. The `@` alias mirrors vite.config.ts so
// test imports resolve the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      // Coverage is reported for the critical pure-logic core only, so the
      // headline number means "is the dangerous code tested", not diluted by UI.
      include: [
        "src/lib/units.ts",
        "src/lib/fuzzy.ts",
        "src/ai/pipeline/map.ts",
        "src/ai/import/resolve.ts",
        "src/ai/import/validate.ts",
        "src/db/guards.ts",
      ],
      thresholds: {
        statements: 90,
        functions: 90,
        lines: 90,
        branches: 85,
      },
    },
  },
});
