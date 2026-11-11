import { mkdir, open, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tasks } from "../src/asset-pilot/tasks.mjs";
import { results } from "../src/asset-pilot/protocol.ts";

// Preparation is separate from model trials. Re-running the public entry
// point must preserve the control records and their pre-trial timestamps.
await mkdir(results, { recursive: true });
const lock = join(results, "prepare.lock");
const handle = await open(lock, "wx");
try {
  const files = await readdir(results);
  if (tasks.every(t => files.includes(t.id + ".control.json"))) {
    console.log("All six frozen control records already exist:", results);
  } else if (files.includes("matrix.lock") || files.some(f => f.endsWith(".trial.json"))) {
    throw Error("Incomplete controls for a measured batch: " + results);
  } else {
    await import("../src/asset-pilot/prepare.ts");
  }
} finally {
  await handle.close();
  await unlink(lock);
}
