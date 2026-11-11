import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import type { Language } from "../../../weichai/packages/contracts/src/index.ts";
import { compileWorkspace } from "../../../weichai/services/adaptation-service/src/workspace-compiler.ts";
import { searchModulesWithSag2 } from "../../../weichai/services/code-intelligence-service/src/index.ts";
import { gradeCopy } from "../real-projects/grading.ts";
import { manifest, publicTask, sha, type Manifest } from "../real-projects/inputs.ts";
import { publicCommand } from "../real-projects/method-files.ts";
import { openRealIndex } from "../real-projects/method-index.ts";
import type { RealFixture } from "../real-projects/types.ts";
import { crossLanguageTruthRefs } from "./cases.ts";

export async function freezePoly(
  f: RealFixture,
  root: string,
  variant: "starter" | "golden",
) {
  await mkdir(root, { recursive: true });
  await f.prepare(root, variant);
  const m = await manifest(root, f);
  const t = publicTask(f, m);
  if (
    t.readFiles.some((path) => !m.files[path]) ||
    f.modules.some((u) => f.references.includes(u.path))
  ) {
    throw Error("Unusable task scope: " + f.id);
  }
  if (t.referenceFiles.length === 0) {
    throw Error("Task has no structural referenceFiles for sag2sql: " + f.id);
  }
  return {
    m,
    inputHash: sha(
      JSON.stringify({ public: t, tree: m.hash, upstream: f.upstream }),
    ),
  };
}

export async function polyScope(f: RealFixture, starter: string, m: Manifest) {
  const task = {
    ...publicTask(f, m),
    ...(f.id.endsWith("-l1") ? { fullHistoryRoot: "refs/history" as const } : {}),
  };
  let readableLines = 0;
  for (const p of task.readFiles) {
    const content = await readFile(join(starter, p), "utf8");
    const lines = content.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    readableLines += lines.length;
  }
  const physicalLines = Object.values(m.stats).reduce(
    (n, s) => n + s.physical,
    0,
  );
  const publicSpec = JSON.stringify(task, (_key, v) =>
    typeof v === "string" && isAbsolute(v)
      ? v === process.execPath
        ? "@node"
        : relative(resolve("."), v).replaceAll("\\", "/")
      : v,
  );
  const inputHash = sha(
    JSON.stringify({
      schema: 1,
      upstream: f.upstream,
      tree: m.hash,
      publicSpec: JSON.parse(publicSpec),
    }),
  );
  return { task, inputHash, physicalLines, readableLines };
}

export async function indexedHistoryStats(starter: string, m: Manifest, indexed: string[]) {
  const history = "refs/history/";
  const files = indexed.filter((p) => p.startsWith(history)).sort();
  const supported = /\.(?:c|h|cpp|hpp|cs|go|java|js|py|ts)$/;
  const expected = Object.keys(m.files).filter((p) => p.startsWith(history) && supported.test(p)).sort();
  assert.deepEqual(files, expected, "The scanner must index every supported history source file");
  const repositories: Record<string, { files: number; lines: number }> = {};
  for (const path of files) {
    const repo = path.split("/")[2];
    const content = await readFile(join(starter, path), "utf8");
    const lines = content.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    const entry = repositories[repo] ??= { files: 0, lines: 0 };
    entry.files++;
    entry.lines += lines.length;
  }
  const lines = Object.values(repositories).reduce((total, r) => total + r.lines, 0);
  assert(lines >= 100_000, `Indexed history is below 100k LoC: ${lines}`);
  return { repositories, files: files.length, lines };
}

export async function preparePoly(f: RealFixture, base: string) {
  const dir = await mkdtemp(join(base, "f-")),
    starter = join(dir, "s"),
    golden = join(dir, "g");
  const frozen = await freezePoly(f, starter, "starter"),
    oracle = await freezePoly(f, golden, "golden");
  const writable = f.modules.map((m) => m.path);

  assert.deepEqual(
    Object.keys(frozen.m.files),
    Object.keys(oracle.m.files),
    "Different file inventory in controls for " + f.id,
  );
  assert.deepEqual(
    Object.keys(oracle.m.files)
      .filter((p) => oracle.m.files[p] !== frozen.m.files[p])
      .sort(),
    [...writable].sort(),
    "Controls must differ in exactly the writable modules for " + f.id,
  );

  const controls = [];
  for (const [variant, root] of [
    ["golden", golden],
    ["starter", starter],
  ] as const) {
    const signal = new AbortController().signal;
    const build = await compileWorkspace(
      root,
      publicCommand(f.compile),
      signal,
    );
    const tests = await compileWorkspace(root, publicCommand(f.test), signal);
    const checks = await gradeCopy(f, root);
    if (
      variant === "golden" &&
      (!build.success || !tests.success || checks.some((c) => !c.passed))
    ) {
      throw Error(
        `Broken golden control (${f.id}): ` +
          JSON.stringify({ build, tests, checks }),
      );
    }
    if (
      variant === "starter" &&
      (tests.success || checks.every((c) => c.passed))
    ) {
      throw Error(
        `Starter fails to distinguish missing implementation (${f.id})`,
      );
    }
    controls.push({ variant, build, tests, checks });
  }

  // Per-module ablation check: replacing any single writable module with its starter stub must fail grading
  for (const module of f.modules) {
    const checks = await gradeCopy(f, golden, starter, [module.path]);
    assert(
      checks.some((c) => !c.passed),
      `Grader does not exercise ${module.path} in ${f.id}`,
    );
    controls.push({ variant: "missing " + module.path, checks });
  }

  const { task, inputHash, physicalLines, readableLines } = await polyScope(
    f,
    starter,
    frozen.m,
  );

  assert(
    Object.keys(frozen.m.stats).length >= 5,
    `Expected multi-language reference pool (>= 5 languages) for ${f.id}, got ${Object.keys(frozen.m.stats).join(", ")}`,
  );

  const truthRefs = crossLanguageTruthRefs[f.id] ?? [];
  const truthSet = new Set(truthRefs);
  const distractorReferenceFiles = task.referenceFiles.filter((p) =>
    p.startsWith("refs/distractors/") || p.startsWith("refs/history/"),
  );

  // Verify sag2sql SQLite FTS5 + JEV indexing & cross-language recall on starter referenceFiles without mutating starter
  const sagSignal = new AbortController().signal;
  const sagIndex = await openRealIndex(
    task,
    starter,
    join(dir, "idx"),
    sagSignal,
  );
  let indexedReferenceFiles: string[] = [];
  const sag2Recall: {
    module: string;
    targetPath: string;
    targetLanguage: string;
    candidates: {
      path: string;
      language: string;
      score: number;
      isCrossLangTruth: boolean;
      isDistractor: boolean;
    }[];
  }[] = [];
  try {
    assert(
      sagIndex.indexedFiles.length > 0,
      `sag2sql indexed 0 files for ${f.id}`,
    );
    indexedReferenceFiles = sagIndex.indexedFiles;

    const supported: Language[] = [
      "TypeScript",
      "Python",
      "Java",
      "C#",
      "Rust",
      "Go",
      "C",
      "C++",
    ];
    const byExt: Record<string, string> = {
      ".py": "Python",
      ".js": "JavaScript",
      ".ts": "TypeScript",
      ".go": "Go",
      ".c": "C",
      ".h": "C",
      ".cpp": "C++",
      ".java": "Java",
    };
    for (const unit of f.modules) {
      const rawLang = unit.language ?? byExt[extname(unit.path)] ?? "TypeScript";
      const contractLang: Language = supported.includes(rawLang as Language)
        ? (rawLang as Language)
        : "TypeScript";
      const candidates = await searchModulesWithSag2(
        sagIndex.store,
        {
          target: {
            id: unit.name,
            name: unit.name,
            kind: "module",
            path: unit.path,
            signature: unit.name,
            language: contractLang,
            module: {
              sourceFiles: [unit.path],
              coreApis: [],
              purpose: unit.description,
              description: unit.description,
              dependsOn: unit.dependsOn ?? [],
            },
          },
          requirement: unit.description,
          repositoryIds: [sagIndex.repositoryId],
          topK: 3,
        },
        sagSignal,
        { maxHops: 2 },
      );
      sag2Recall.push({
        module: unit.name,
        targetPath: unit.path,
        targetLanguage: rawLang,
        candidates: candidates.map((c) => {
          const p = c.sourceModule?.sourceFiles?.[0] ?? c.path;
          return {
            path: p,
            language: c.language,
            score: Number((c.score?.overall ?? 0).toFixed(4)),
            isCrossLangTruth: truthSet.has(p),
            isDistractor: distractorReferenceFiles.includes(p),
          };
        }),
      });
    }
  } finally {
    await sagIndex.close();
  }

  assert.equal(
    (await manifest(starter, f)).hash,
    frozen.m.hash,
    `Public check or sag2sql modified frozen starter (${f.id})`,
  );
  assert.equal(
    (await manifest(golden, f)).hash,
    oracle.m.hash,
    `Public check modified golden control (${f.id})`,
  );

  const granularity = f.id.endsWith("-l1") ? "L1" : "L2";

  return {
    task,
    starter,
    frozen: frozen.m,
    controls,
    summary: {
      taskId: f.id,
      title: f.title,
      granularity,
      upstream: f.upstream,
      inputHash,
      treeHash: frozen.m.hash,
      goldenHash: oracle.m.hash,
      files: Object.keys(frozen.m.files).length,
      languages: frozen.m.stats,
      physicalLines,
      readableLines,
      readFiles: task.readFiles.length,
      referenceFiles: task.referenceFiles.length,
      indexedReferenceFiles,
      history: task.fullHistoryRoot ? await indexedHistoryStats(starter, frozen.m, indexedReferenceFiles) : undefined,
      crossLangTruthRefs: truthRefs,
      distractorReferenceFiles,
      sag2Recall,
      writable,
      controls,
    },
  };
}
