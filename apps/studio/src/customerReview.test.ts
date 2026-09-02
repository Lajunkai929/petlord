import { describe, expect, it } from "vitest";
import type { CustomerReviewResponse } from "@petlord/schema";
import { seedProject } from "./seed";
import { applyCustomerReviewResponse, buildCustomerReviewHtml, createCustomerReviewRound, parseCustomerReviewResponse } from "./customerReview";

const respondedAt = "2026-08-31T01:00:00.000Z";

function responseFor(round: ReturnType<typeof createCustomerReviewRound>, decision: "approved" | "changes"): CustomerReviewResponse {
  return {
    format: "petlord-review-response",
    version: 1,
    projectId: seedProject.id,
    roundId: round.id,
    customerName: "小林",
    respondedAt,
    items: round.items.map((item, index) => ({
      id: item.id,
      decision: index === 0 ? decision : "approved",
      comment: index === 0 && decision === "changes" ? "耳朵再小一点" : "",
    })),
  };
}

describe("offline customer review workflow", () => {
  it("captures every currently reviewable state without inventing missing transition media", () => {
    const round = createCustomerReviewRound(seedProject, "round-1", "2026-08-31T00:00:00.000Z");
    expect(round.sequence).toBe(1);
    expect(round.items).toHaveLength(6);
    expect(round.items.every((item) => item.mediaKind === "image")).toBe(true);
    expect(round.items.find((item) => item.entityId === "state-sitting")?.label).toContain("实际状态");
    expect(round.items.find((item) => item.entityId === "state-lying")?.label).toContain("权威参考");
  });

  it("builds a self-contained HTML review page and escapes customer-controlled names", async () => {
    const project = structuredClone(seedProject);
    project.characterName = "Lottery </title><script>alert(1)</script>";
    project.artifacts = project.artifacts.map((artifact) => ({ ...artifact, uri: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }));
    const html = await buildCustomerReviewHtml(project, createCustomerReviewRound(project, "round-safe"));
    expect(html).toContain("petlord-review-response");
    expect(html).toContain("data:image/gif;base64");
    expect(html).not.toContain("</title><script>alert(1)</script>");
    expect(html).toContain("\\u003c/script>");
  });

  it("imports requested changes once and advances an all-approved order to delivery", () => {
    const round = createCustomerReviewRound(seedProject, "round-2", "2026-08-31T00:00:00.000Z");
    const reviewing = structuredClone(seedProject);
    reviewing.order.reviewRounds = [round];
    const changes = applyCustomerReviewResponse(reviewing, responseFor(round, "changes"));
    expect(changes.order.status).toBe("revision");
    expect(changes.order.revisionUsed).toBe(1);
    expect(changes.order.reviewRounds[0]?.items[0]).toMatchObject({ decision: "changes", comment: "耳朵再小一点" });
    expect(applyCustomerReviewResponse(changes, responseFor(round, "changes")).order.revisionUsed).toBe(1);

    const approved = applyCustomerReviewResponse(reviewing, responseFor(round, "approved"));
    expect(approved.order.status).toBe("ready");
    expect(approved.order.deliveryChecklist.customerApproved).toBe(true);
  });

  it("validates the returned response contract before applying it", () => {
    const round = createCustomerReviewRound(seedProject, "round-3", "2026-08-31T00:00:00.000Z");
    expect(parseCustomerReviewResponse(JSON.stringify(responseFor(round, "approved"))).roundId).toBe("round-3");
    expect(() => parseCustomerReviewResponse("{}" )).toThrow();
  });
});
