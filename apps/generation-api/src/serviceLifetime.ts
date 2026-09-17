import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
const nativeExec = promisify(execFile);

/** Own native process lifetimes as well as their output promises. */
export function createServiceLifetime() {
  const controller = new AbortController();
  const children = new Set<ReturnType<typeof execFile>>();
  const finished = new Set<Promise<void>>();
  const execute = ((file: string, args: string[], options: ExecFileOptions = {}) => {
    const output = nativeExec(file, args, { ...options, signal: controller.signal });
    const child = output.child;
    children.add(child);
    const closed = new Promise<void>(resolve => child.once("close", () => { children.delete(child); resolve(); }));
    finished.add(closed);
    void closed.then(() => finished.delete(closed));
    return output;
  }) as typeof nativeExec;
  async function close() {
    controller.abort(new Error("PetLord service is stopping."));
    const force = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); }, 500);
    force.unref();
    try { await Promise.allSettled([...finished]); } finally { clearTimeout(force); }
  }
  return { signal: controller.signal, execute, close };
}
