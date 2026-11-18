import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { runCodex } from "../large-projects/codex.ts";
import type { ProjectModel, ReasoningEffort } from "../project-bench/providers.ts";

export function codexHomeRoot() {
  return join(process.env.LOCALAPPDATA || join(homedir(), ".cache"), "recast", "codex-runs", "nl2repo");
}
export function configureCodexBinary() {
  if (!process.env.RECAST_CODEX_BIN && process.platform === "win32") {
    const binary = join(process.env.APPDATA || "", "npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe");
    if (existsSync(binary)) process.env.RECAST_CODEX_BIN = binary;
  }
}
export async function preflightCodex(model: ProjectModel, project = "sqlparse", effort: ReasoningEffort = "low") {
  configureCodexBinary();
  const recipe = JSON.parse(await readFile(`work/nl2repo/cases/${project}.json`, "utf8"));
  await mkdir("work/nl2repo/preflight", { recursive: true });
  const runRoot = await mkdtemp(resolve("work/nl2repo/preflight", "cli-"));
  let requests = 0;
  const command = { executable: process.env.RECAST_BENCH_PYTHON || "python", args: ["--version"], timeoutMs: 10_000 };
  const result = await runCodex({ model, effort, sourceRoot: recipe.starter, runRoot,
    homeRoot: codexHomeRoot(), preflightOnly: true, signal: AbortSignal.timeout(45_000),
    onCall() { requests++; },
    task: { id: project, title: project, requirement: await readFile(join(recipe.starter, "TASK.md"), "utf8"),
      modules: recipe.modules, readFiles: Object.keys(recipe.input.files), referenceFiles: [],
      compileCommand: command, testCommand: command },
  });
  assert.equal(requests, 0, "Preflight must not request model inference");
  assert.equal(result.error, null, "Native Codex preflight failed");
  const record = { model, effort, project, modelRequests: requests, runtime: result.runtime };
  await writeFile("results/nl2repo-native-preflight.json", JSON.stringify(record, null, 2) + "\n");
  console.log("Native Codex preflight passed; model requests:", requests);
  return record;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await preflightCodex((process.argv[2] || "gpt-6-luna") as ProjectModel);
