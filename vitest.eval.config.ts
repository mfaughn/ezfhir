import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/eval/**/*.test.ts"],
    testTimeout: 120000,
  },
});
