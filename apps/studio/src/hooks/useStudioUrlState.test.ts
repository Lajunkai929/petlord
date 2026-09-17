// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { CharacterProject } from "@petlord/schema";
import type { StudioArea, StudioSelection } from "../studioTypes";
import { createBlankProject } from "../projectTemplate";
import { useStudioUrlState } from "./useStudioUrlState";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("keeps a requested drawing state while the real project hydrates", async () => {
  const initial = createBlankProject({ characterName: "Pet", customerName: "", contact: "", quotedPriceCny: 0, depositCny: 0, revisionLimit: 0, notes: "" });
  const actual: CharacterProject = { ...initial, id: "actual", logicalStates: [{ ...initial.logicalStates[0], id: "painted-state" }] };
  window.history.replaceState(null, "", "/?page=draw&project=actual&state=painted-state");
  let observed: StudioSelection;
  function Harness({ project, ready }: { project: CharacterProject; ready: boolean }) {
    const [selection, setSelection] = useState<StudioSelection>({ kind: "state", id: "painted-state" });
    const [activeArea, setActiveArea] = useState<StudioArea>("drawing");
    useStudioUrlState({ project, ready, activeArea, selection, setSelection, setActiveArea, activateProject: () => false });
    observed = selection; return null;
  }
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(createElement(Harness, { project: initial, ready: false })));
    expect(observed!).toEqual({ kind: "state", id: "painted-state" });
    expect(window.location.search).toBe("?page=draw&project=actual&state=painted-state");
    await act(async () => root.render(createElement(Harness, { project: actual, ready: true })));
    expect(observed!).toEqual({ kind: "state", id: "painted-state" });
    expect(window.location.search).toBe("?page=draw&project=actual&state=painted-state");
  } finally { await act(async () => root.unmount()); window.history.replaceState(null, "", "/"); }
});
