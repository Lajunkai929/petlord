import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "plugins/**/*.test.ts"],
    environment: "node",
    // Media integration tests also spawn Swift, Vision and FFmpeg processes.
    // Leave CPU capacity for those children instead of filling every core with workers.
    maxWorkers: Math.min(4, availableParallelism()),
  },
});
