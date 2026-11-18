import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, open, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { PROJECT_MODELS, providerAvailable } from "../project-bench/providers.ts";
import { implementationHash, productIdentity, sha } from "./identity.ts";
import { preflightCodex } from "./preflight.ts";

const { values } = parseArgs({ options: {
  batch: { type: "string" }, project: { type: "string" }, model: { type: "string" },
  tokens: { type: "string" }, seconds: { type: "string" },
  repeats: { type: "string", default: "1" }, plan: { type: "boolean" },
} });
assert(values.batch && /^[\w-]+$/.test(values.batch), "Supply --batch NAME");
assert(PROJECT_MODELS.includes(values.model as any), "Supply --model " + PROJECT_MODELS.join("|"));
const tokens = values.tokens === undefined ? null : Number(values.tokens);
const seconds = values.seconds === undefined ? null : Number(values.seconds);
const repeats = Number(values.repeats);
assert([tokens, seconds, repeats].every(n => n === null || (Number.isSafeInteger(n) && n > 0)), "Explicit budgets/repeats must be positive integers");
const projects = ["sqlparse", "rich-click", "deepdiff", "boltons", "jinja"].filter(p => !values.project || p === values.project);
assert(projects.length, "Unknown project");
const root = resolve("results/nl2repo", values.batch);
const protocol = {
  version: "nl2repo-declaration-v1", model: values.model, effort: "low", tokens, seconds, repeats, projects,
  methods: ["recast", "codex"], references: "empty", score: "fixed-baseline-pass-rate; macro-average-per-project",
  ...productIdentity(), implementationHash: await implementationHash(), responseOutputCap: tokens === null ? null : 8192,
  inputs: {} as Record<string, { hash: string; controlHash: string | null; ready: boolean }>,
};
for (const project of projects) {
  const recipe = JSON.parse(await readFile(`work/nl2repo/cases/${project}.json`, "utf8"));
  const controlPath = `results/nl2repo-controls/docker/${project}.json`;
  const controlText = existsSync(controlPath) ? await readFile(controlPath, "utf8") : null;
  const control = controlText ? JSON.parse(controlText) : null;
  const ready = control?.status === "ready" && control.inputHash === recipe.input.sha256;
  protocol.inputs[project] = { hash: recipe.input.sha256, controlHash: controlText && sha(controlText), ready };
  if (!values.plan) assert(ready, `Run isolated controls first: npm run controls:nl2repo -- --project ${project}`);
}
if (values.plan) {
  console.log(JSON.stringify({ ...protocol, trials: projects.length * 2 * repeats, billableRequests: 0 }, null, 2));
} else {
  assert(await providerAvailable(values.model as any), "Missing model credentials (use the existing bench .env.local)");
  await preflightCodex(values.model as any, projects[0]);
  await mkdir(root, { recursive: true });
  const lease = await open(join(root, "running.lock"), "wx");
  try {
  await lease.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const protocolPath = join(root, "protocol.json");
  if (existsSync(protocolPath)) assert.deepEqual(JSON.parse(await readFile(protocolPath, "utf8")), protocol, "Batch protocol changed; use a new batch name");
  else await writeFile(protocolPath, JSON.stringify(protocol, null, 2) + "\n");
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (let index = 0; index < projects.length; index++) {
      const project = projects[index];
      // Alternate paired order by project and repetition.
      const methods = (index + repeat) % 2 ? ["codex", "recast"] : ["recast", "codex"];
      for (const method of methods) {
        const result = join(root, `${project}-${repeat}-${method}.json`);
        if (existsSync(result)) { console.log("RECORDED", result); continue; }
        await new Promise<void>((ok, fail) => {
          const worker = spawn(process.execPath, [...process.execArgv, resolve("src/nl2repo/trial.ts"),
            protocolPath, project, String(repeat), method, result], { stdio: "inherit", windowsHide: true });
          worker.once("error", fail);
          worker.once("exit", code => code === 0 ? ok() : fail(Error(`Trial exited ${code}: ${project}/${method}`)));
        });
      }
    }
  }
  } finally { await lease.close(); await unlink(join(root, "running.lock")); }
}
