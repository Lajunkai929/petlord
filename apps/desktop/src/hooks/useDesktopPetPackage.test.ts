import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listRemotePackages, normalizeSubscriptionServerUrl, parsePetPackage, sameNamePackageTarget } from "./useDesktopPetPackage";

afterEach(() => vi.unstubAllGlobals());

describe("desktop package loading", () => {
  it("accepts the deliverable package contract", () => {
    const contents = readFileSync(new URL("../../public/demo/sample.petlord", import.meta.url), "utf8");
    const bundle = parsePetPackage(contents);
    expect(bundle.manifest.characterName).toBe("Lottery");
    expect(bundle.manifest.initialStateId).toBe("variant-sitting-a");
  });

  it("accepts multiple installable versions of the same pet", () => {
    const first = parsePetPackage(readFileSync(new URL("../../public/demo/sample.petlord", import.meta.url), "utf8"));
    const second = parsePetPackage(readFileSync(new URL("../../public/demo/sample-v2.petlord", import.meta.url), "utf8"));
    expect(second.createdAt).not.toBe(first.createdAt);
    expect(second.manifest.id).not.toBe(first.manifest.id);
    expect(second.manifest.characterName).toBe("Lottery V2");
  });

  it("prefers replacing a same-name configuration on import", () => {
    const packages = [
      { key: "lottery.petlord", active: true, createdAt: "2026-09-02T00:00:00.000Z", id: "one", name: "Lottery 清透版", characterName: "Lottery", stateCount: 4, transitionCount: 6 },
      { key: "qiuqiu.petlord", active: false, createdAt: "2026-09-01T00:00:00.000Z", id: "two", name: "球球", characterName: "球球", stateCount: 4, transitionCount: 6 },
    ];
    expect(sameNamePackageTarget(" lottery 清透版 ", packages)?.key).toBe("lottery.petlord");
    expect(sameNamePackageTarget("新宠物", packages)).toBeUndefined();
  });

  it("normalizes server and feed URLs into one subscription origin", () => {
    expect(normalizeSubscriptionServerUrl("http://127.0.0.1:4312/")).toBe("http://127.0.0.1:4312");
    expect(normalizeSubscriptionServerUrl("https://pets.example.com/api/library/packages")).toBe("https://pets.example.com");
    expect(() => normalizeSubscriptionServerUrl("file:///tmp/pets")).toThrow("HTTP 或 HTTPS");
    expect(() => normalizeSubscriptionServerUrl("https://user:secret@pets.example.com")).toThrow("HTTP 或 HTTPS");
  });

  it("validates packages returned by a browser subscription", async () => {
    vi.stubGlobal("window", {});
    const item = {
      publicationId: "a".repeat(64),
      packageId: "pet-a",
      name: "Milo",
      characterName: "Milo",
      createdAt: "2026-09-03T00:00:00.000Z",
      publishedAt: "2026-09-03T00:01:00.000Z",
      stateCount: 4,
      transitionCount: 6,
      sizeBytes: 4096,
      downloadPath: `/api/library/packages/${"a".repeat(64)}/download`,
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([item]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listRemotePackages("https://pets.example.com/api/library")).resolves.toEqual([item]);
    expect(fetchMock).toHaveBeenCalledWith("https://pets.example.com/api/library/packages", expect.objectContaining({ headers: { Accept: "application/json" } }));
  });
});
