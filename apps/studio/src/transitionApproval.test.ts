import { describe, expect, it } from "vitest";
import { lotteryPixelProject } from "./lotteryPixelProject";
import { approveProjectTransition } from "./transitionApproval";

describe("approveProjectTransition", () => {
  it("reuses the target authority variant so its existing outbound graph remains reachable", () => {
    const result = approveProjectTransition(lotteryPixelProject, "pixel-lying-sit", () => "unused");
    expect(result).toMatchObject({ kind: "authority-reference", createdVariant: false });
    expect(result.variantId).toBe("variant-pixel-authority-state-pixel-sitting");
    expect(result.project.transitions.find((transition) => transition.id === "pixel-lying-sit")).toMatchObject({
      status: "approved",
      toVariantId: "variant-pixel-authority-state-pixel-sitting",
    });
  });

  it("returns a self transition to the exact same source variant", () => {
    const result = approveProjectTransition(lotteryPixelProject, "pixel-lying-ear", () => "unused");
    expect(result).toMatchObject({ kind: "source-frame", createdVariant: false });
    expect(result.project.transitions.find((transition) => transition.id === "pixel-lying-ear")?.toVariantId)
      .toBe(result.project.transitions.find((transition) => transition.id === "pixel-lying-ear")?.fromVariantId);
  });

  it("creates a distinct actual variant only when the user chooses a video frame", () => {
    const project = structuredClone(lotteryPixelProject);
    project.transitions = project.transitions.map((transition) => transition.id === "pixel-lying-sit"
      ? { ...transition, endFrameSource: "video-frame", extractedTailArtifactId: "tail" }
      : transition);
    const result = approveProjectTransition(project, "pixel-lying-sit", () => "tail-variant");
    expect(result).toMatchObject({ kind: "video-frame", createdVariant: true, variantId: "variant-tail-variant" });
    expect(result.project.variants.at(-1)).toMatchObject({ imageArtifactId: "tail", origin: { kind: "transition-tail" } });
  });
});
