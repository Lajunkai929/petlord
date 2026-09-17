import { it, expect } from "vitest";
import { transitionSchema } from "@petlord/schema";
import { createBlankProject } from "../projectTemplate";
import * as commands from "./designCommand";
const project = createBlankProject({
  customerName: "",
  contact: "",
  characterName: "Pet",
  quotedPriceCny: 0,
  depositCny: 0,
  revisionLimit: 0,
  notes: "",
  projectTemplateId: "blank",
});
it("refuses a stale animation draft if the final persist observes changed timing or repeat settings", async () => {
  const transition = transitionSchema.parse({ id: "t", label: "T", fromVariantId: "v", toLogicalStateId: "s", status: "draft", nativeAnimation: {frames: [{imageArtifactId: "image", durationMs: 120}]} });
  const old = {...project, transitions: [transition]};
  let requested = false;
  await expect(commands.executeStudioDesignCommand("pixel.animation.bind", {transitionId: "t", frames: [{frameId:"f",durationMs:120}]}, {
    persist: async () => ({data: {...old, transitions:[{...transition, nativeAnimation:{frames:[{imageArtifactId:"image",durationMs:400}]}}]}, revision:9}),
    current: () => old, adopt: () => {}, commit: () => {},
    request: async () => { requested=true; return new Response("{}"); },
  })).rejects.toThrow(/冲突/);
  expect(requested).toBe(false);
});
it("submits the persisted revision and preserves an unrelated concurrent human edit", async () => {
  const remote = { ...project, productionRoute: "native-pixel" as const };
  let adopted: any;
  let committed: any;
  let sent: any;
  await commands.executeStudioDesignCommand(
    "project.update",
    { patch: { productionRoute: "native-pixel" } },
    {
      persist: async () => ({ data: project, revision: 7 }),
      current: () => ({ ...project, name: "Human name" }),
      adopt: (snapshot) => {
        adopted = snapshot;
      },
      commit: (p) => {
        committed = p;
      },
      request: async (_, init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({ result: { project: remote, revision: 8 } }),
          { status: 200 },
        );
      },
    },
  );
  expect(sent).toMatchObject({
    command: "project.update",
    projectId: project.id,
    expectedRevision: 7,
  });
  expect(adopted.revision).toBe(8);
  expect(committed).toMatchObject({
    name: "Human name",
    productionRoute: "native-pixel",
  });
});
it("does not adopt or overwrite when command collides with a concurrent human edit", async () => {
  let changed = false;
  await expect(
    commands.executeStudioDesignCommand(
      "project.update",
      {},
      {
        persist: async () => ({ data: project, revision: 7 }),
        current: () => ({ ...project, name: "Human" }),
        adopt: () => {
          changed = true;
        },
        commit: () => {
          changed = true;
        },
        request: async () =>
          new Response(
            JSON.stringify({
              result: { project: { ...project, name: "Agent" }, revision: 8 },
            }),
          ),
      },
    ),
  ).rejects.toThrow(/冲突/);
  expect(changed).toBe(false);
});
it.each(["pixel.document.set", "pixel.document.save"])("rejects a draft overwrite for %s when persist discovers a changed remote pixel document", async (command) => {
  const old = {
    ...project,
    pixelDocument: {
      schemaVersion: 1 as const,
      width: 1,
      height: 1,
      palette: { R: "#FF0000" },
      frames: [{ id: "f", layers: [{ id: "b", x: 0, y: 0, rows: ["R"] }] }],
    },
  };
  let requested = false;
  await expect(
    commands.executeStudioDesignCommand(
      command,
      { document: old.pixelDocument },
      {
        persist: async () => ({
          data: {
            ...old,
            pixelDocument: { ...old.pixelDocument, palette: { R: "#00FF00" } },
          },
          revision: 9,
        }),
        current: () => old,
        adopt: () => {},
        commit: () => {},
        request: async () => {
          requested = true;
          return new Response(
            JSON.stringify({ result: { project: old, revision: 10 } }),
          );
        },
      },
    ),
  ).rejects.toThrow(/冲突/);
  expect(requested).toBe(false);
});
