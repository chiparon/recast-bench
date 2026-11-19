import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  createProjectClient,
  PROJECT_MODELS,
  type ProjectModel,
} from "../project-bench/providers.ts";
import { runRealRaw } from "../real-projects/method-raw.ts";
import { json } from "../polycodeeval/protocol.ts";
import { HistoryIndex, bridge } from "./workspace.ts";

const base = resolve("work/cas-pilot"),
  src = resolve("src/cas-pilot"),
  starter = join(base, "public/target");
const py = join(
  base,
  process.platform === "win32"
    ? "runtime/Scripts/python.exe"
    : "runtime/bin/python",
);
const execute = promisify(execFile);
const load = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const hash = (p: string) =>
  createHash("sha256").update(readFileSync(p)).digest("hex");
const python = (args: string[], opts: any = {}) =>
  execFileSync(py, ["-B", ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    ...opts,
  });
export async function runPair(values: {
  batch?: string;
  model?: string;
  methods?: string;
  controls?: boolean;
  granularity?: string;
}) {
  const model = (values.model ?? "gpt-6-luna") as ProjectModel;
  const staged = values.granularity === "family";
  const batch =
    !values.batch || values.batch === "poly-v6"
      ? staged
        ? "cas-family-v1"
        : "cas-pair-v2"
      : values.batch;
  const arms = (values.methods ?? "matched,none").split(",");
  assert(
    PROJECT_MODELS.includes(model) &&
      /^[\w-]+$/.test(batch) &&
      new Set(arms).size === arms.length &&
      arms.every((a) => ["matched", "none"].includes(a)),
  );
  const freeze = load(join(base, "private/freeze.json")),
    paths = Object.keys(freeze.starterTree).sort(),
    writable = Object.keys(freeze.writable).sort();
  for (const p of paths)
    assert.equal(hash(join(starter, p)), freeze.starterTree[p], p);
  const repos = load(join(src, "history-lock.json")).repositories,
    evidence = load(join(src, "history-evidence.json"));
  const historyCheck = JSON.parse(python([join(src, "history.py")]));
  assert.deepEqual(historyCheck, evidence);
  const idx = new HistoryIndex(join(base, "public/history")),
    empty = new HistoryIndex();
  // Independent queries over original source, including Julia and Lisp.
  const checks: Record<string, string> = {
    flint: "fmpz_poly_factor_zassenhaus",
    jas: "GroebnerBaseSeq",
    abstractalgebra: "PuiseuxSeriesRing",
    maxima: "risch",
  };
  const probes = repos.map((r: any, i: number) => {
    assert.equal(
      idx.counts[r.directory],
      evidence.repositories[i].source_files,
    );
    const query = checks[r.directory],
      hits = idx.search(query, "history/" + r.directory + "/");
    const match = hits.find((h) =>
      h.content.toLowerCase().includes(query.toLowerCase()),
    );
    assert(match, "Missing body hit for " + r.directory);
    assert(idx.files.get(match.path)!.includes(match.content));
    assert.deepEqual(empty.search(query), []);
    return { repo: r.directory, files: idx.counts[r.directory], query, match };
  });
  assert.equal(empty.files.size, 0);
  const out = resolve("results/polycodeeval-bench", batch),
    work = join(base, "runs", batch);
  mkdirSync(out, { recursive: true });
  mkdirSync(work, { recursive: true });
  const image = execFileSync(
    "docker",
    ["image", "inspect", "recast-cas:py312-v1", "--format", "{{.Id}}"],
    { encoding: "utf8" },
  ).trim();
  const frozenChecks = load(resolve("results/cas-pilot.json")).controls;
  const env = { ...process.env, CAS_PILOT_IMAGE: image };
  const controls: Record<string, unknown> = {};
  for (const [variant, path] of [
    ["starter", starter],
    ["restored", join(base, "private/golden")],
  ]) {
    for (const suite of ["public", "private"]) {
      const dest = join(work, variant + "-" + suite + "-control.json");
      try {
        python(
          [join(src, "grade.py"), path, "--suite", suite, "--json", dest],
          { env },
        );
      } catch (e: any) {
        if (variant !== "starter" || e.status !== 1 || !existsSync(dest))
          throw e;
      }
      const checks = load(dest);
      const counts = Object.fromEntries(
        Object.entries(checks.groups).map(([k, g]: any) => [
          k,
          [g.passed, g.checks],
        ]),
      );
      assert.deepEqual(
        counts,
        frozenChecks[variant][suite].groups,
        "Sandbox score drift: " + variant + "/" + suite,
      );
      controls[variant + "/" + suite] = counts;
    }
  }
  const control = {
    batch,
    model,
    image,
    controls,
    starterHash: freeze.starterSHA256,
    indexed: idx.files.size,
    noneIndexed: empty.files.size,
    probes,
  };
  await json(join(out, "retrieval.json"), control);
  console.log("Verified", idx.counts, "empty index", empty.files.size);
  if (staged) {
    const { runFamilies } = await import("./families.ts");
    idx.close();
    empty.close();
    await runFamilies({
      base,
      src,
      starter,
      py,
      env,
      paths,
      writable,
      control,
      arms,
      out,
      work,
      controlsOnly: !!values.controls,
    });
    return;
  }
  if (values.controls) {
    idx.close();
    empty.close();
    return;
  }
  const publicCommand = (...args: string[]) => ({
    executable: py,
    args: ["-B", join(src, "sandbox.py"), image, ...args],
    timeoutMs: 120000,
  });
  const task = {
    id: freeze.task,
    title: "Reconstruct SymPy",
    requirement: readFileSync(join(starter, "TASK.md"), "utf8"),
    modules: writable.map((path) => ({
      name: path,
      path,
      description: "Restore missing function bodies",
    })),
    readFiles: paths,
    referenceFiles: [],
    compileCommand: publicCommand("compile"),
    testCommand: publicCommand("public"),
    moduleTestCommands: Object.fromEntries(
      Object.keys(freeze.packages).map((n) => [n, publicCommand("public", n)]),
    ),
  };
  const results = await Promise.allSettled(
    arms.map(async (arm) => {
      const id = model + "-" + arm,
        dir = join(work, id),
        dst = join(out, id + ".json");
      if (existsSync(dst)) {
        const prior = load(dst);
        assert.deepEqual(prior.controls, control.controls);
        assert.equal(prior.image, image);
        assert.equal(prior.starterHash, control.starterHash);
        console.log("Existing trial", dst);
        return;
      }
      const checkpoint = join(dir, "trial.json");
      let meta;
      if (existsSync(checkpoint)) {
        meta = load(checkpoint);
        assert.equal(meta.image, image);
        assert.equal(meta.starterHash, control.starterHash);
        assert.deepEqual(meta.controls, control.controls);
      } else {
        mkdirSync(dir); // Never mix transcripts or overwrite a partial submission.
        const log = (v: any) =>
          appendFileSync(join(dir, "events.jsonl"), JSON.stringify(v) + "\n");
        const calls: any[] = [];
        const client = createProjectClient(model, {
          uncapped: true,
          onCall: (c) => {
            calls.push(c);
            log({ tool: "model", ...c });
          },
        });
        const start = Date.now();
        const r = await runRealRaw(
          { arm: "rawagent", task, sourceRoot: starter, runRoot: dir, client },
          new AbortController().signal,
          (root) => {
            writeFileSync(join(dir, "root.txt"), root);
            return bridge(
              root,
              paths,
              writable,
              arm === "matched" ? idx : empty,
              log,
            );
          },
        );
        const runtime = r.runtime.agent;
        await json(join(dir, "agent.json"), runtime);
        const candidate = join(dir, "submission");
        cpSync(r.outputRoot, candidate, {
          recursive: true,
          filter: (p) => !p.endsWith("/.git") && !p.endsWith("\\.git"),
        });
        meta = {
          ...control,
          arm,
          usage: client.usage(),
          servedModels: [
            ...new Set(
              calls.filter((c) => c.status === "ok").map((c) => c.servedModel),
            ),
          ],
          modelCalls: calls.length,
          startedAt: new Date(start).toISOString(),
          executionSeconds: (Date.now() - start) / 1000,
          stop: r.error,
          agentFinal: runtime.message,
          turns: runtime.turns,
          work: dir,
          candidate,
        };
        await json(join(dir, "trial.json"), meta);
      }
      assert.deepEqual(
        meta.servedModels,
        [model],
        "Provider did not serve the selected model",
      );
      const grades: Record<string, any> = {};
      for (const suite of ["public", "private"]) {
        const path = join(dir, suite + ".json");
        try {
          await execute(
            py,
            [
              "-B",
              join(src, "task.py"),
              "grade",
              meta.candidate,
              "--suite",
              suite,
              "--json",
              path,
            ],
            { env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
          );
        } catch (e: any) {
          if (e.code !== 1 || !existsSync(path)) throw e;
        }
        grades[suite] = load(path);
      }
      await json(dst, { ...meta, grades });
      console.log("END", arm, meta.turns, meta.usage.totalTokens, meta.stop);
    }),
  );
  idx.close();
  empty.close();
  for (const r of results) if (r.status === "rejected") throw r.reason;
}
