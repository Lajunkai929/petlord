import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

const loopback = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
function sameSecret(actual: string, expected: string) {
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function localRequestAccess(headers: IncomingHttpHeaders, origin: string, token?: string): { status: number; code: string; message: string } | undefined {
  try {
    const host = new URL(`http://${headers.host ?? ""}`);
    if (!loopback.has(host.hostname)) return { status: 403, code: "INVALID_HOST", message: "Only loopback hosts may access this service." };
  } catch { return { status: 403, code: "INVALID_HOST", message: "Invalid request host." }; }
  if (headers.origin) {
    try {
      const source = new URL(headers.origin);
      const permitted = token ? source.origin === origin : source.protocol === "http:" && loopback.has(source.hostname);
      if (!permitted) return { status: 403, code: "INVALID_ORIGIN", message: "Cross-origin access is not allowed." };
    } catch { return { status: 403, code: "INVALID_ORIGIN", message: "Invalid request origin." }; }
  }
  if (token) {
    const bearer = headers.authorization?.startsWith("Bearer ") ? headers.authorization.slice(7) : "";
    const cookie = headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith("petlord_session="))?.slice("petlord_session=".length) ?? "";
    if (!sameSecret(bearer, token) && !sameSecret(cookie, token)) return { status: 401, code: "UNAUTHORIZED", message: "A valid local design token is required." };
  }
  return undefined;
}
