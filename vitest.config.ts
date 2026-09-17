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
      "@": path.resolve(__dirname, "."),
    },
  },
});
