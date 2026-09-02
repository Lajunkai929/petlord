import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Serializes complete JSON snapshots and commits each one with an atomic rename.
 *
 * A unique temporary file protects separate writer instances, while the queue
 * preserves call order within this process. A failed write is isolated so it
 * cannot poison later persistence attempts.
 */
export class AtomicJsonFileWriter {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  write(value: unknown): Promise<void> {
    const snapshot = JSON.stringify(value, null, 2);
    const execute = async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, snapshot);
        await rename(temporaryPath, this.filePath);
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    };

    const pending = this.queue.then(execute, execute);
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }
}
