import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/benchmark/**/*.test.ts"],
    testTimeout: 120000,
  },
});
