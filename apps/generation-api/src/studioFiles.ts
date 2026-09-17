import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".webm": "video/webm", ".mp4": "video/mp4", ".woff2": "font/woff2", ".ico": "image/x-icon", ".petlord": "application/vnd.petlord.package+gzip" };

export async function serveStudioFile(request: IncomingMessage, response: ServerResponse, directory: string, pathname: string): Promise<boolean> {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const root = await realpath(directory);
  let relative: string;
  try { relative = decodeURIComponent(pathname); } catch { return false; }
  if (relative.includes("\0") || relative.includes("\\")) return false;
  let file = resolve(root, `.${relative === "/" ? "/index.html" : relative}`);
  if (!file.startsWith(root + sep)) return false;
  try {
    const metadata = await stat(file);
    if (!metadata.isFile()) return false;
  } catch {
    if (extname(relative)) return false;
    file = resolve(root, "index.html");
  }
  try {
    const actual = await realpath(file);
    if (!actual.startsWith(root + sep)) return false;
    const metadata = await stat(actual);
    const type = types[extname(actual).toLowerCase()] ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Content-Length": metadata.size, "X-Content-Type-Options": "nosniff", "Cache-Control": type.startsWith("text/html") ? "no-store" : "private, max-age=3600" });
    if (request.method === "HEAD") response.end();
    else createReadStream(actual).on("error", () => response.destroy()).pipe(response);
    return true;
  } catch { return false; }
}
