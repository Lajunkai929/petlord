import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startPetLordServer } from "./appServer";
export { startPetLordServer, type PetLordServerOptions } from "./appServer";

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const service = await startPetLordServer();
  process.stdout.write(`PetLord design API ready on ${service.url}\n`);
  const stop = () => { void service.close().then(() => process.exit(0)); };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
