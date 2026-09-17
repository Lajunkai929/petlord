import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { startPetLordServer } from "./appServer";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function launch() {
  const directory = await mkdtemp(join(tmpdir(), "petlord-integrated-api-"));
  const studioDirectory = join(directory, "studio");
  await mkdir(studioDirectory);
  await writeFile(join(studioDirectory, "index.html"), "<!doctype html><title>Bundled Studio</title><main>Design your pet</main>");
  await writeFile(join(studioDirectory, "app.js"), "console.log('bundled');");
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const server = await startPetLordServer({ port: 0, host: "127.0.0.1", runtimeDataDirectory: join(directory, "data"), studioDirectory, authToken: "test-token-01234567890123456789" });
  cleanup.push(() => server.close());
  return { ...server, directory, headers: { Authorization: "Bearer test-token-01234567890123456789" } };
}

describe("embedded Studio API lifecycle", () => {
  it("returns an assigned listening URL and serves its bundled frontend without a Vite server", async () => {
    const server = await launch();
    expect(new URL(server.url).port).not.toBe("0");
    const response = await fetch(server.url, { headers: server.headers });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Design your pet");
    const js = await fetch(server.url + "/app.js", { headers: server.headers });
    expect(js.headers.get("Content-Type")).toContain("javascript");
    const health = await fetch(server.url + "/api/health", { headers: server.headers });
    expect(await health.json()).toMatchObject({ status: "ready", protocolVersion: 1 });
  });

  it("accepts the private Studio cookie and refuses unauthenticated or cross-origin access", async () => {
    const server = await launch();
    expect((await fetch(server.url + "/api/providers")).status).toBe(401);
    const cookie = await fetch(server.url + "/api/providers", { headers: { Cookie: "petlord_session=test-token-01234567890123456789", Origin: server.url } });
    expect(cookie.status).toBe(200);
    expect((await fetch(server.url + "/api/providers", { headers: { ...server.headers, Origin: "https://untrusted.example" } })).status).toBe(403);
    const invalidHost = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = request(server.url + "/api/providers", { headers: { ...server.headers, Host: "untrusted.example" } }, incoming => { incoming.resume(); incoming.on("end", () => resolve(incoming.statusCode)); });
      outgoing.on("error", reject); outgoing.end();
    });
    expect(invalidHost).toBe(403);
  });

  it("keeps two running workspaces independent and reports invalid JSON as client input", async () => {
    const left = await launch(), right = await launch();
    const save = await fetch(left.url + "/api/workspace/state/example", { method: "PUT", headers: { ...left.headers, "Content-Type": "application/json" }, body: JSON.stringify({ data: "left only" }) });
    expect(save.status).toBe(200);
    const value = await fetch(right.url + "/api/workspace/state/example", { headers: right.headers });
    expect(await value.json()).toEqual({ data: null });
    const bad = await fetch(left.url + "/api/workspace/state/example", { method: "PUT", headers: { ...left.headers, "Content-Type": "application/json" }, body: "{not json}" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
  });
});
