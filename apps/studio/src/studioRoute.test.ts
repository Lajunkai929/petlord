import { describe, expect, it } from "vitest";
import { seedProject } from "./seed";
import { buildStudioUrl, parseStudioRoute, resolveStudioSelection } from "./studioRoute";

describe("studio URL state", () => {
  it("parses a transition deep link", () => {
    expect(parseStudioRoute("http://localhost:4310/?page=edit&project=project-a&transition=edge-a")).toEqual({
      area: "graph",
      projectId: "project-a",
      selection: { kind: "transition", id: "edge-a" },
    });
  });

  it("serializes the current page, project and selected state", () => {
    expect(buildStudioUrl("http://localhost:4310/?ignored=true#old", {
      area: "preview",
      projectId: "project with spaces",
      selection: { kind: "state", id: "state-sitting" },
    })).toBe("/?page=preview&project=project+with+spaces&state=state-sitting");
  });

  it("omits graph selection outside creation pages", () => {
    expect(buildStudioUrl("http://localhost:4310/", {
      area: "orders",
      projectId: "project-a",
      selection: { kind: "transition", id: "edge-a" },
    })).toBe("/?page=projects&project=project-a");
  });

  it("falls back safely when a linked node no longer exists", () => {
    expect(resolveStudioSelection(seedProject, { kind: "transition", id: "deleted-edge" })).toEqual({
      kind: "state",
      id: seedProject.logicalStates[0].id,
    });
  });
});
