// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { lotteryClearProject } from "../lotteryClearProject";
import { useProjectWorkspace } from "./useProjectWorkspace";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

it("prefers an explicit cold-start project over the previously active workspace project", async () => {
  const first = { ...structuredClone(lotteryClearProject), id: "previous-project", name: "Previous" };
  const preferred = { ...structuredClone(lotteryClearProject), id: "preferred-project", name: "Preferred" };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://petlord.test");
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/api/workspace/entities/project" && init?.method === undefined) {
      return json([{ data: first, revision: 1 }, { data: preferred, revision: 2 }]);
    }
    if (url.pathname === "/api/workspace/entities/identity" && init?.method === undefined) return json([]);
    if (url.pathname === "/api/workspace/state/workspace-registry" && init?.method === undefined) {
      return json({ data: { activeProjectId: first.id, projectIds: [first.id, preferred.id] } });
    }
    if (url.pathname === "/api/workspace/state/workspace-registry" && init?.method === "PUT") return json({ saved: true });
    if (url.pathname.startsWith("/api/workspace/entities/project/") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      return json({ data: body.data, revision: body.expectedRevision ?? 3 });
    }
    if (url.pathname.startsWith("/api/workspace/entities/identity/") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      return json({ data: body.data, revision: body.expectedRevision ?? 4 });
    }
    throw new Error(`Unexpected workspace request: ${init?.method ?? "GET"} ${url.pathname}`);
  }) as typeof fetch;
  cleanups.push(() => { globalThis.fetch = originalFetch; });
  localStorage.clear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  cleanups.push(() => { act(() => root.unmount()); host.remove(); localStorage.clear(); });

  function Probe() {
    const workspace = useProjectWorkspace(preferred.id);
    return createElement("output", { "data-hydrated": String(workspace.hydrated) }, workspace.project.id);
  }
  await act(async () => { root.render(createElement(Probe)); });
  for (let attempt = 0; attempt < 30 && host.textContent !== preferred.id; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }

  expect(host.querySelector("output")?.dataset.hydrated).toBe("true");
  expect(host.textContent).toBe(preferred.id);
});
