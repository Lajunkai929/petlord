import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

const nativeMediaTests = [
  "apps/generation-api/src/headlessGeneration.test.ts",
  "apps/generation-api/src/headlessVideo.test.ts",
  "apps/generation-api/src/openProviders.test.ts",
  "apps/generation-api/src/unifiedProject.test.ts",
];

export default defineConfig({
  test: {
    environment: "node",
    maxWorkers: Math.min(4, availableParallelism()),
    projects: [
      {
        test: {
          name: "core",
          include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "plugins/**/*.test.ts"],
          exclude: nativeMediaTests,
        },
      },
      {
        test: {
          name: "native-media",
          include: nativeMediaTests,
          globalSetup: ["apps/generation-api/test/nativeMediaSetup.ts"],
          // Finish other workers before serial native jobs so CI CPUs remain available
          // to FFmpeg/Vision. The real helper is built once before job deadlines start.
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
