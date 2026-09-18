import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    restoreMocks: true,

    // Coverage
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      reportsDirectory: "./coverage",
      include: [
        "lib/**/*.ts",
        "hooks/**/*.ts",
        "components/**/*.tsx",
      ],
      exclude: [
        "lib/test-factory.ts",
        "**/*.d.ts",
        "**/*.test.ts",
      ],
      // Ratchet up as coverage improves — current baseline: 5.5% lines
      // thresholds: { lines: 10, functions: 20, branches: 15, statements: 10 },
    },
  },
  resolve: {
    alias: {
      // Longest prefix first — the vendored package ships TS source.
      "@fourcorners/canvas/react": path.resolve(__dirname, "packages/canvas/react/index.ts"),
      "@fourcorners/canvas/theme": path.resolve(__dirname, "packages/canvas/theme/index.ts"),
      "@fourcorners/canvas": path.resolve(__dirname, "packages/canvas/index.ts"),
      "@": path.resolve(__dirname, "."),
      // Node tests import server modules directly; the real package exists to
      // fail a client bundle, which is not what a test is.
      "server-only": path.resolve(__dirname, "__tests__/stubs/server-only.ts"),
    },
  },
});
