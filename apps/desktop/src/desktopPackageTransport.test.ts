import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";

describe("desktop package byte transport", () => {
  it("keeps gzip V2 packages as bytes instead of UTF-8 text", () => {
    const source = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
    expect(source).not.toMatch(/readFile\(path\.join\(packageDirectory\(\)[^\n]+"utf8"/);
    expect(source).not.toMatch(/readFile\(result\.filePaths\[0\], "utf8"\)/);

    const encoded = gzipSync(Buffer.from(JSON.stringify({ format: "petlord-package", bundleVersion: 2 }), "utf8"));
    const binaryRoundTrip = Buffer.from(encoded);
    expect(JSON.parse(gunzipSync(binaryRoundTrip).toString("utf8"))).toMatchObject({ bundleVersion: 2 });
    expect(Buffer.from(encoded.toString("utf8"), "utf8")).not.toEqual(encoded);
  });
});
