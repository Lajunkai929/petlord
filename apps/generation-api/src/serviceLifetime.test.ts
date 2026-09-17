import { it, expect } from "vitest";
import { createServiceLifetime } from "./serviceLifetime";

it("aborts and waits for a real native child process before returning", async () => {
  const lifetime = createServiceLifetime();
  const running = lifetime.execute(process.execPath, ["-e", "process.stdout.write('ready');setInterval(()=>{},1000)"]);
  const outcome = running.catch(error => error);
  await new Promise<void>(resolve => running.child.stdout!.once("data", () => resolve()));
  const pid = running.child.pid!;
  await lifetime.close();
  expect(lifetime.signal.aborted).toBe(true);
  expect((await outcome).code).toBe("ABORT_ERR");
  expect(() => process.kill(pid, 0)).toThrow();
});
