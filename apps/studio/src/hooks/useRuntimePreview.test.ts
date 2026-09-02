import { describe, expect, it } from "vitest";
import { lotteryClearProject } from "../lotteryClearProject";
import { runtimeProjectRevision } from "./useRuntimePreview";

describe("runtime preview configuration revision", () => {
  it("changes for a deeply edited interaction rule", () => {
    const before = structuredClone(lotteryClearProject);
    const after = structuredClone(lotteryClearProject);
    after.transitions[0].triggers = [{
      id: "preview-live-trigger",
      event: "right-click",
      enabled: true,
      region: { shape: "ellipse", x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    }];
    expect(runtimeProjectRevision(after)).not.toBe(runtimeProjectRevision(before));
  });

  it("does not reset the running preview for job progress-only changes", () => {
    const before = structuredClone(lotteryClearProject);
    const after = structuredClone(lotteryClearProject);
    after.jobs[0] = { ...after.jobs[0], progress: 42 };
    expect(runtimeProjectRevision(after)).toBe(runtimeProjectRevision(before));
  });
});
