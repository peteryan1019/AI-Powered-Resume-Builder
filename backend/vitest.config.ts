import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // These suites are deliberately dependency-free: no database, no network,
    // no API keys. That keeps them runnable in CI without secrets.
    testTimeout: 20_000,
  },
});
