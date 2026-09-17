import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    foregroundMaskerPath: string;
  }
}

/** A suite-owned executable, never a substitute mask or production runtime directory. */
export function nativeMediaFixtureOptions() {
  const foregroundMaskerPath = inject("foregroundMaskerPath");
  if (process.platform === "darwin" && !foregroundMaskerPath) {
    throw new Error("Run native media tests through the native-media Vitest project.");
  }
  return { foregroundMaskerPath };
}
