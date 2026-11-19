import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { meterExisting, sumUsage, type MeterCall } from "../large-projects/meter.ts";
import { runCodex } from "../large-projects/codex.ts";
import { runRealMethod } from "../real-projects/methods.ts";
import type { MethodTask } from "../real-projects/method-types.ts";
import { implementationHash, productIdentity } from "./identity.ts";
import { codexHomeRoot } from "./preflight.ts";

const [protocolPath, project, repetition, method, resultPath] = process.argv.slice(2);
assert(method === "recast" || method === "codex");
const protocol = JSON.parse(await readFile(protocolPath, "utf8"));
for (const [key, value] of Object.entries(productIdentity())) assert.equal(protocol[key], value, "Product changed between paired trials");
assert.equal(protocol.implementationHash, await implementationHash(), "Benchmark code changed between paired trials");
const recipe = JSON.parse(await readFile(`work/nl2repo/cases/${project}.json`, "utf8"));
const controlText = await readFile(`results/nl2repo-controls/docker/${project}.json`, "utf8");
const control = JSON.parse(controlText);
assert.equal(createHash("sha256").update(controlText).digest("hex"), protocol.inputs[project].controlHash);
assert.equal(recipe.input.sha256, protocol.inputs[project].hash);
for (const [name, hash] of Object.entries(recipe.input.files)) {
  assert.equal(createHash("sha256").update(await readFile(join(recipe.starter, name))).digest("hex"), hash, "Input changed: " + name);
}
const python = process.env.RECAST_BENCH_PYTHON || "python";
const compile = { executable: python, args: ["-B", "public_check.py", project, "--syntax"], timeoutMs: 30_000 };
const check = { executable: python, args: [resolve("src/nl2repo/public_runtime.py"), project, control.environment.image, control.environment.transport], timeoutMs: 130_000 };
const task: MethodTask = {
  id: project, title: "NL2Repo " + project,
  requirement: await readFile(join(recipe.starter, "TASK.md"), "utf8"),
  modules: recipe.modules, readFiles: Object.keys(recipe.input.files), referenceFiles: [],
  compileCommand: compile, testCommand: check,
  moduleCompileCommands: Object.fromEntries(recipe.modules.map((m: any) => [m.name,
    { ...compile, args: [...compile.args, "--file", m.path] }])),
};
await mkdir("work/nl2repo/trials", { recursive: true });
const work = await mkdtemp(resolve("work/nl2repo/trials", project + "-" + method + "-"));
const controller = new AbortController();
const timer = protocol.seconds === null ? undefined : setTimeout(() => controller.abort(Error("Shared wall-time budget exhausted")), protocol.seconds * 1000);
const calls: MeterCall[] = [];
let used = 0;
const onCall = (call: MeterCall) => {
  calls.push(call);
  appendFileSync(join(work, "calls.ndjson"), JSON.stringify(call) + "\n");
  used += call.usage?.totalTokens ?? 0;
  if (protocol.tokens !== null && used >= protocol.tokens) controller.abort(Error("Shared reported-token budget exhausted"));
};
// Both harnesses get the same response cap and stop threshold. The last request's
// input can overshoot the cumulative threshold; record actual usage, never trim it.
const originalFetch = globalThis.fetch;
let verifiedGenerationRequests = 0;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (/^https:\/\/(api\.openai\.com\/v1|api\.deepseek\.com)\/responses$/.test(url) && typeof init?.body === "string") {
    controller.signal.throwIfAborted();
    const body = JSON.parse(init.body);
    assert.equal(body.reasoning?.effort, protocol.effort, "Outgoing model request differs from the frozen reasoning effort");
    verifiedGenerationRequests++;
    if (protocol.responseOutputCap === null) delete body.max_output_tokens;
    else body.max_output_tokens = Math.max(16, Math.min(protocol.responseOutputCap, protocol.tokens - used));
    init = { ...init, body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, ...(init.signal ? [init.signal] : [])]) };
  }
  return originalFetch(input, init);
};
let output: any = null, error: string | null = null;
const startedAt = new Date().toISOString(), started = performance.now();
console.log("START", project, method, repetition, startedAt);
try {
  const common = { model: protocol.model, effort: protocol.effort, task, sourceRoot: recipe.starter, runRoot: work, signal: controller.signal };
  if (method === "codex") output = await runCodex({ ...common, onCall,
    homeRoot: codexHomeRoot() });
  else {
    const transport = meterExisting(protocol.model, onCall, protocol.effort, protocol.seconds === null);
    try { output = await runRealMethod({ ...common, arm: "recast", disableModuleTimeout: protocol.seconds === null, client: transport.client }); }
    finally { transport.close(); }
  }
} catch (e) { error = String(e); }
finally { clearTimeout(timer); globalThis.fetch = originalFetch; }
let outputRoot: string | null = output?.outputRoot ?? null;
// Retain and grade partial work even when a harness fails before publication.
if (!outputRoot) {
  const pipelineRoot = join(work, "project-pipelines");
  if (existsSync(pipelineRoot)) {
    for (const entry of await readdir(pipelineRoot)) {
      const candidate = join(pipelineRoot, entry, "project");
      if (existsSync(candidate)) { outputRoot = candidate; break; }
    }
  }
}
const executionMs = performance.now() - started;
await writeFile(join(work, "runtime.json"), JSON.stringify(output?.runtime ?? null, null, 2));
const gradePath = join(work, "grade.json");
let gradingError: string | null = null, grade: any = null;
try {
  await promisify(execFile)(python, ["-B", resolve("src/nl2repo/evaluate.py"), "--project", project,
    "--candidate", outputRoot ?? recipe.starter, "--output", gradePath], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  grade = JSON.parse(await readFile(gradePath, "utf8"));
} catch (e) { gradingError = String(e); }
const result = {
  project, method, repetition: Number(repetition), model: protocol.model,
  effort: protocol.effort, verifiedGenerationRequests,
  inputHash: recipe.input.sha256, controlHash: protocol.inputs[project].controlHash,
  startedAt, executionMs, wallMs: performance.now() - started, work, outputRoot,
  commit: output?.commit ?? null, error: error ?? output?.error ?? null, gradingError,
  budgetStop: controller.signal.aborted ? String(controller.signal.reason) : null,
  usage: sumUsage(calls), grade,
  // Harness publication status is separate from test pass rate.
  score: grade?.score ?? null,
};
await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n");
console.log("END", project, method, result.score, result.usage.totalTokens);
