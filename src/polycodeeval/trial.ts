import { appendFileSync, existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gradeDelivery } from "../real-projects/grading.ts";
import { runRealMethod } from "../real-projects/methods.ts";
import type { RealFixture } from "../real-projects/types.ts";
import type { ProjectModel } from "../project-bench/providers.ts";
import { captureDeepSeekBalance, deepSeekBalanceChange } from "../large-projects/billing.ts";
import { meterExisting, sumUsage, type MeterCall } from "../large-projects/meter.ts";
import { waitForProvider } from "../large-projects/transport.ts";
import { fixtures } from "./cases.ts";
import { json, workRoot, resultsRoot, type Arm } from "./protocol.ts";

const [batch, recipe, modelName, armName] = process.argv.slice(2);
if (existsSync(join(resultsRoot(batch), "drain.json"))) {
  console.log("DRAIN", batch);
  process.exit(75);
}
const { task, starter, frozen, identity } = JSON.parse(
  await readFile(recipe, "utf8"),
);
const f: RealFixture = fixtures.find((item) => item.id === task.id)!;
if (!f) throw Error("Unknown fixture: " + task.id);
const arm = armName as Arm,
  model = modelName as ProjectModel;
const work = await mkdtemp(join(workRoot, "t-"));
const calls: MeterCall[] = [];
function onCall(c: MeterCall) {
  appendFileSync(join(work, "calls.ndjson"), JSON.stringify(c) + "\n");
  calls.push(c);
}
const id = [task.id, model, arm].join("_");
const balance = async () =>
  model === "deepseek-flash"
    ? await captureDeepSeekBalance().catch(() => null)
    : null;
const readiness = await waitForProvider(model);
const before = await balance();
const startedAt = new Date().toISOString(),
  start = performance.now();
console.log("START", id, startedAt, work);
let outputRoot: string | null = null,
  commit: string | null = null,
  indexMs: number | null = null,
  error: string | null = null,
  runtime: unknown = null;
try {
  const base = { task, sourceRoot: starter, runRoot: work };
  if (arm === "codex") {
    const { runCodex } = await import("../large-projects/codex.ts");
    ({ outputRoot, commit, indexMs, error, runtime } = await runCodex({
      ...base,
      model,
      onCall,
    }));
  } else {
    const transport = meterExisting(model, onCall);
    try {
      ({ outputRoot, commit, indexMs, error, runtime } = await runRealMethod({
        ...base,
        arm,
        client: transport.client,
      }));
    } finally {
      transport.close();
    }
  }
} catch (e) {
  error = String(e);
}
const executionMs = performance.now() - start;
let grade = null,
  gradingError: string | null = null;
if (outputRoot)
  try {
    grade = await gradeDelivery(f, starter, frozen, outputRoot, commit);
  } catch (e) {
    gradingError = String(e);
  }
const wallMs = performance.now() - start;
const after = await balance();
const balanceChange =
  before && after ? deepSeekBalanceChange(before, after) : null;
const usage = sumUsage(calls);
const passed = Boolean(commit && grade?.passed && !error && !gradingError);
await json(join(work, "runtime.json"), runtime);
await json(join(resultsRoot(batch), id + ".trial.json"), {
  batch,
  task: task.id,
  granularity: task.id.endsWith("-l1") ? "L1" : "L2",
  model,
  arm,
  ...identity,
  startedAt,
  readiness,
  work,
  outputRoot,
  commit,
  error,
  gradingError,
  grade,
  wallMs,
  executionMs,
  indexMs,
  passed,
  usage,
  calls,
  balanceChange,
});
console.log(
  "END",
  id,
  passed,
  Math.round(wallMs / 1000) + "s",
  usage.totalTokens,
  "tokens",
  error || gradingError || "",
);
