import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteStore } from "./sqliteStore";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("SQLite workspace store", () => {
  it("persists workspace entities, state, jobs and media across reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petlord-sqlite-"));
    directories.push(directory);
    const path = join(directory, "petlord.sqlite");
    const first = new SqliteStore(path);
    first.upsertEntity("project", "project-a", { id: "project-a", name: "球球" });
    first.setState("workspace-registry", { activeProjectId: "project-a" });
    first.upsertGenerationProvider({
      id: "provider-a",
      type: "volcengine-ark",
      capability: "image",
      name: "Ark Images",
      apiKey: "secret-api-key",
      baseUrl: "https://ark.example.com/api/v3",
      enabled: true,
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    first.replaceGenerationJobs([{ id: "job-a", createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:01.000Z" }]);
    first.upsertMedia({ id: "media-a", uri: "/api/media/a.png", mimeType: "image/png" });
    first.upsertAgentEvent({
      id: "event-a",
      source: "codex",
      type: "turn-completed",
      sessionId: "thread-a",
      dedupeKey: "codex:thread-a:turn-a",
      occurredAt: "2026-09-02T00:00:00.000Z",
      receivedAt: "2026-09-02T00:00:01.000Z",
    });
    first.close();

    const reopened = new SqliteStore(path);
    expect(reopened.listEntities("project")).toEqual([{ id: "project-a", name: "球球" }]);
    expect(reopened.getState("workspace-registry")).toEqual({ activeProjectId: "project-a" });
    expect(reopened.getGenerationProvider("provider-a")).toMatchObject({ apiKey: "secret-api-key", capability: "image" });
    expect(reopened.listGenerationProviders()).toHaveLength(1);
    expect(reopened.listGenerationJobs()).toHaveLength(1);
    expect(reopened.listMedia()).toEqual([{ id: "media-a", uri: "/api/media/a.png", mimeType: "image/png" }]);
    expect(reopened.listAgentEvents()).toEqual([expect.objectContaining({ id: "event-a", source: "codex" })]);
    expect(reopened.acknowledgeAgentEvent("event-a", true)).toEqual(expect.objectContaining({
      id: "event-a",
      acknowledgedAt: expect.any(String),
      openedAt: expect.any(String),
    }));
    expect(reopened.listAgentEvents({ unreadOnly: true })).toHaveLength(0);
    reopened.close();
  });

  it("deletes one Provider without touching other capabilities", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petlord-sqlite-"));
    directories.push(directory);
    const store = new SqliteStore(join(directory, "petlord.sqlite"));
    const base = {
      type: "volcengine-ark" as const,
      apiKey: "secret-api-key",
      baseUrl: "https://ark.example.com/api/v3",
      enabled: true,
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    };
    store.upsertGenerationProvider({ ...base, id: "image-provider", capability: "image", name: "Images" });
    store.upsertGenerationProvider({ ...base, id: "video-provider", capability: "video", name: "Video" });
    store.deleteGenerationProvider("image-provider");
    expect(store.getGenerationProvider("image-provider")).toBeUndefined();
    expect(store.listGenerationProviders()).toEqual([expect.objectContaining({ id: "video-provider", capability: "video" })]);
    store.close();
  });

  it("deduplicates connector retries by dedupe key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petlord-sqlite-"));
    directories.push(directory);
    const store = new SqliteStore(join(directory, "petlord.sqlite"));
    const base = {
      source: "claude",
      type: "turn-completed",
      sessionId: "session-a",
      dedupeKey: "claude:session-a:turn-a",
      occurredAt: "2026-09-02T00:00:00.000Z",
      receivedAt: "2026-09-02T00:00:01.000Z",
    };
    expect(store.upsertAgentEvent({ id: "event-a", ...base })).toEqual(expect.objectContaining({ id: "event-a" }));
    expect(store.upsertAgentEvent({ id: "event-b", ...base })).toEqual(expect.objectContaining({ id: "event-a" }));
    expect(store.listAgentEvents()).toHaveLength(1);
    store.close();
  });
});
