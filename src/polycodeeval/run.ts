import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  PROJECT_MODELS,
  providerAvailable,
} from "../project-bench/providers.ts";
import { manifest } from "../real-projects/inputs.ts";
import { captureDeepSeekBalance, deepSeekBalanceChange } from "../large-projects/billing.ts";
import { fixtures } from "./cases.ts";
import {
  arms,
  batchName,
  existing,
  json,
  protocolFingerprint,
  resultsRoot,
  workRoot,
} from "./protocol.ts";
import { polyScope, preparePoly } from "./scope.ts";

const { values } = parseArgs({
  options: {
    batch: { type: "string", default: batchName },
    task: { type: "string" },
    granularity: { type: "string" },
    lang: { type: "string" },
    methods: { type: "string" },
    model: { type: "string" },
    controls: { type: "boolean" },
  },
});
const batch = values.batch!;
assert(/^[\w-]+$/.test(batch));
const tasks = fixtures.filter((f) => {
  if (values.task && f.id !== values.task) return false;
  if (
    values.granularity &&
    !f.id.toLowerCase().endsWith("-" + values.granularity.toLowerCase())
  )
    return false;
  if (
    values.lang &&
    !f.id.toLowerCase().startsWith("poly-" + values.lang.toLowerCase() + "-")
  )
    return false;
  return true;
});
const models = PROJECT_MODELS.filter(
  (m) => !values.model || m === values.model,
);
const methods = values.methods ? values.methods.split(",") : [...arms];
assert(
  tasks.length &&
    models.length &&
    methods.length &&
    methods.every((a) => arms.some((x) => x === a)),
  "Invalid selector",
);
const root = resultsRoot(batch);
await Promise.all(
  [root, workRoot].map((dir) => mkdir(dir, { recursive: true })),
);
const protocol = await protocolFingerprint();
const recipes = new Map<string, { path: string; identity: any }>();

for (const f of tasks) {
  const recordPath = join(root, f.id + ".control.json");
  const prior = await existing(recordPath);
  if (prior) {
    assert.equal(
      prior.implementationHash,
      protocol.implementationHash,
      "Batch implementation changed",
    );
    assert.equal(prior.productRevision, protocol.productRevision);
    assert.equal(prior.productDiff, protocol.productDiff);
    const recipe = await existing(prior.recipe);
    if (recipe) {
      const actual = await manifest(recipe.starter, f);
      assert.equal(
        actual.hash,
        recipe.frozen.hash,
        "Frozen starter changed on disk",
      );
      assert.equal(actual.hash, prior.treeHash);
      const current = await polyScope(f, recipe.starter, actual);
      const identity = { ...protocol, inputHash: current.inputHash };
      assert.deepEqual(recipe.identity, identity);
      assert.deepEqual(recipe.task, current.task);
      assert.deepEqual(recipe.frozen, actual);
      assert.equal(prior.inputHash, current.inputHash);
      recipes.set(f.id, { path: prior.recipe, identity });
      console.log(
        "CACHED",
        f.id,
        prior.granularity,
        prior.physicalLines,
        "lines,",
        prior.referenceFiles,
        "refs,",
        identity.inputHash.slice(0, 12),
      );
      continue;
    }
  }
  console.log("CONTROL", f.id, new Date().toISOString());
  const prepared = await preparePoly(f, workRoot);
  const identity = { ...protocol, inputHash: prepared.summary.inputHash };
  if (prior) assert.equal(prior.inputHash, identity.inputHash);
  const recipe = join(prepared.starter, "..", "recipe.json");
  await json(recipe, {
    task: prepared.task,
    starter: prepared.starter,
    frozen: prepared.frozen,
    identity,
  });
  await json(recordPath, { ...prepared.summary, ...protocol, recipe });
  recipes.set(f.id, { path: recipe, identity });
  console.log(
    "READY",
    f.id,
    prepared.summary.granularity,
    prepared.summary.physicalLines,
    "lines,",
    prepared.summary.referenceFiles,
    "refs,",
    identity.inputHash.slice(0, 12),
  );
}

if (!values.controls) {
  for (const m of models)
    assert(await providerAvailable(m), "Missing provider " + m);
  const opening = models.includes("deepseek-flash")
    ? await captureDeepSeekBalance()
    : null;
  const deepSeekCells: string[] = [];
  const lanes = await Promise.allSettled(
    models.map(async (model) => {
      const modelIdx = PROJECT_MODELS.indexOf(model);
      for (const f of tasks) {
        const recipe = recipes.get(f.id)!;
        for (let k = 0; k < arms.length; k++) {
          const arm = arms[(k + modelIdx + fixtures.indexOf(f)) % arms.length];
          if (!methods.includes(arm)) continue;
          const id = [f.id, model, arm].join("_");
          const out = join(root, id + ".trial.json"),
            done = await existing(out);
          if (done) {
            assert.equal(done.inputHash, recipe.identity.inputHash);
            assert.equal(
              done.implementationHash,
              recipe.identity.implementationHash,
            );
            assert.equal(done.productRevision, recipe.identity.productRevision);
            assert.equal(done.productDiff, recipe.identity.productDiff);
            continue;
          }
          if (await existing(join(root, "drain.json"))) return;
          const lock = join(root, id + ".lock");
          const handle = await open(lock, "wx").catch(() => null);
          if (!handle) continue;
          await handle.writeFile(
            JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
          );
          await handle.close();
          try {
            if (model === "deepseek-flash") deepSeekCells.push(id);
            await runTrial(recipe.path, model, arm);
          } finally {
            await unlink(lock).catch(() => {});
          }
        }
      }
    }),
  );
  if (opening && deepSeekCells.length) {
    const closing = deepSeekBalanceChange(
      opening,
      await captureDeepSeekBalance(),
    );
    await wait(30_000);
    const after30s = deepSeekBalanceChange(
      opening,
      await captureDeepSeekBalance(),
    );
    await json(join(root, "deepseek-" + randomUUID() + ".wallet.json"), {
      cells: deepSeekCells,
      closing,
      after30s,
    });
  }
  const failed = lanes.filter((l) => l.status === "rejected");
  if (failed.length) throw (failed[0] as PromiseRejectedResult).reason;
}

function runTrial(recipe: string, model: string, arm: string) {
  return new Promise<void>((resolveTrial, reject) => {
    const child = spawn(
      process.execPath,
      [resolve("launch.mjs"), "src/polycodeeval/trial.ts", batch, recipe, model, arm],
      { stdio: "inherit", windowsHide: true },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 || code === 75
        ? resolveTrial()
        : reject(new Error(`${model}/${arm} exited ${code}`)),
    );
  });
}
