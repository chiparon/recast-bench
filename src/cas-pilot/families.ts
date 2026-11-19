import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { FamilyIndex, families, type Family } from "./family-index.ts";
import { bridge } from "./workspace.ts";
import { runRealRaw } from "../real-projects/method-raw.ts";
import {
  RealProjectFiles,
  git,
  commitOptions,
} from "../real-projects/method-files.ts";
import {
  createProjectClient,
  type ProjectModel,
} from "../project-bench/providers.ts";
import { json } from "../polycodeeval/protocol.ts";

const exec = promisify(execFile);
const load = (path: string) => JSON.parse(readFileSync(path, "utf8"));
type Options = {
  base: string;
  src: string;
  starter: string;
  py: string;
  env: NodeJS.ProcessEnv;
  paths: string[];
  writable: string[];
  control: {
    image: string;
    model: ProjectModel;
    batch: string;
    starterHash: string;
  };
  arms: string[];
  out: string;
  work: string;
  controlsOnly: boolean;
};

export async function runFamilies(o: Options) {
  const { base, src, py, starter, paths, writable, control, env } = o,
    groups = Object.keys(families) as Family[];
  const index = new FamilyIndex(),
    empty = new Map<string, string>();
  await index.build(
    join(base, "public/history"),
    load(join(src, "history-lock.json")),
    load(join(src, "history-evidence.json")),
  );
  const scheduled = {} as Record<
    Family,
    Awaited<ReturnType<FamilyIndex["lookup"]>>
  >;
  for (const group of groups) {
    const hit = await index.lookup(group, families[group]);
    assert(hit.hops >= 1 && hit.hits.length);
    scheduled[group] = hit;
  }
  const probes = [];
  for (const [repo, query] of Object.entries({
    flint: "Zassenhaus polynomial factorization",
    jas: "GroebnerBaseSeq polynomial ideal",
    abstractalgebra: "Puiseux series ring",
    maxima: "Risch indefinite integration",
  })) {
    const found = await index.lookup("probe", query, repo);
    assert(
      found.hits.every(
        (h) =>
          h.path.startsWith("history/" + repo + "/") && index.files.has(h.path),
      ) && found.hits.length,
    );
    probes.push({ repo, ...found });
  }
  await json(join(o.out, "sag2.json"), {
    engine: "searchModulesWithSag2 + Sag2Bm25IndexStore",
    maxHops: 2,
    projection:
      "one file per module, language-neutral source fragments and declaration-name heuristics",
    counts: index.counts,
    scheduled,
    probes,
  });
  if (o.controlsOnly) {
    await index.close();
    return;
  }
  const signal = new AbortController().signal;
  const smoke = readFileSync(join(starter, "smoke.py"), "utf8"),
    spec = readFileSync(join(starter, "TASK.md"), "utf8");
  const command = (...args: string[]) => ({
    executable: py,
    args: ["-B", join(src, "sandbox.py"), control.image, ...args],
    timeoutMs: 120000,
  });
  async function grade(
    root: string,
    suite: string,
    dest: string,
    group?: string,
    validate = false,
  ) {
    const args = validate
      ? [join(src, "task.py"), "grade", root]
      : [join(src, "grade.py"), root];
    args.push("--suite", suite, "--json", dest);
    if (group) args.push("--group", group);
    try {
      await exec(py, ["-B", ...args], {
        env,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (e: any) {
      if (e.code !== 1 || !existsSync(dest)) throw e;
    }
    return load(dest);
  }
  const finish = await Promise.allSettled(
    o.arms.map(async (arm) => {
      const id = control.model + "-" + arm,
        dir = join(o.work, id);
      mkdirSync(dir, { recursive: true });
      const final = join(o.out, id + ".json");
      if (existsSync(final)) {
        assert.equal(load(final).starterHash, control.starterHash);
        return;
      }
      const snapFile = join(dir, "snapshot.json");
      const snapshot = existsSync(snapFile)
        ? load(snapFile)
        : await new RealProjectFiles(dir).snapshot(
            starter,
            randomUUID(),
            signal,
          );
      await json(snapFile, snapshot);
      writeFileSync(join(dir, "root.txt"), snapshot.outputRoot);
      const root = snapshot.outputRoot,
        stages = [];
      for (const group of groups) {
        const stage = join(dir, group);
        mkdirSync(stage, { recursive: true });
        const done = join(stage, "result.json");
        if (existsSync(done)) {
          stages.push(load(done));
          continue;
        }
        const before = stages.at(-1)?.commit ?? snapshot.baselineCommit;
        const log = (e: any) =>
          appendFileSync(
            join(dir, "events.jsonl"),
            JSON.stringify({ group, ...e }) + "\n",
          );
        const attempt = join(stage, "attempt.json");
        let info;
        if (existsSync(attempt)) info = load(attempt);
        else {
          assert.equal(await git(root, ["rev-parse", "HEAD"]), before);
          assert.equal(
            await git(root, ["status", "--porcelain"]),
            "",
            "Interrupted partial stage; preserve it before resuming.",
          );
          const prior = await grade(
            root,
            "private",
            join(stage, "before.json"),
            group,
          );

          const seed = arm === "matched" ? scheduled[group].hits : [];
          const publicResult = await grade(
            root,
            "public",
            join(stage, "public-before.json"),
            group,
          );
          const client = createProjectClient(control.model, {
            uncapped: true,
            onCall: (r) => log({ tool: "model", ...r }),
          });
          const prefix = "sympy/" + group + "/",
            focus = writable.filter((p) => p.startsWith(prefix));
          const probe = smoke.match(
            new RegExp(
              "^def " + group + "\\(s, x\\):[\\s\\S]*?(?=\\n\\n\\n)",
              "m",
            ),
          )?.[0];
          const prompt = [
            spec,
            "Current independently dispatched family: " +
              group +
              ". " +
              families[group],
            "Deliver general implementations for this family's missing behavior. Prefer useful end-to-end paths and fix shared prerequisites if necessary. Other families will get their own sessions; hand off only the current family. Your edits accumulate.",
            "Current family paths: " + JSON.stringify(focus),
            "Public example: " + probe,
            "Public check before this stage: " +
              JSON.stringify(publicResult.groups[group]),
            "Retrieved implementation references: " + JSON.stringify(seed),
          ].join("\n\n");
          log({
            tool: "family_context",
            scope: "history",
            query: families[group],
            hops: arm === "matched" ? scheduled[group].hops : 0,
            hits: seed,
          });
          const history = {
            files: arm === "matched" ? index.files : empty,
            async search(query: string, filter: string, offset: number) {
              if (arm === "none") return [];
              const result = await index.lookup(group, query);
              log({
                tool: "sag2_lookup",
                query,
                hops: result.hops,
                paths: result.hits.map((h) => h.path),
              });
              return result.hits
                .filter((h) => h.path.includes(filter))
                .slice(offset);
            },
          };
          const task = {
            id: "cas-family-" + group,
            title: group,
            requirement: prompt,
            readFiles: paths,
            referenceFiles: [],
            modules: writable.map((path) => ({
              path,
              name: path,
              description: "Restore implementation",
            })),
            compileCommand: command("compile"),
            testCommand: command("public", group),
            moduleTestCommands: { [group]: command("public", group) },
          };
          const t = Date.now();
          console.log("START", arm, group, new Date().toISOString());
          const r = await runRealRaw(
            {
              arm: "rawagent",
              client,
              sourceRoot: starter,
              runRoot: dir,
              task,
            },
            signal,
            () => {
              const b = bridge(
                root,
                paths,
                [...focus, ...writable.filter((p) => !p.startsWith(prefix))],
                history,
                log,
              );
              return {
                ...b,
                reviewHandoff: true,
                instructions:
                  "Use list_files, search_source, read_slice and edit_lines. The primary family paths are listed above. Run the current family check via run_tests. Cite history paths actually used in edits. The next family starts only after the host tests this submission.",
              };
            },
            snapshot,
          );
          info = {
            elapsedSeconds: (Date.now() - t) / 1000,
            agent: r.runtime.agent,
            error: r.error,
            usage: client.usage(),
            before,
            servedModels: [
              ...new Set(
                client.trace
                  .filter((c) => c.status === "ok")
                  .map((c) => c.servedModel),
              ),
            ],
            prior: prior.groups[group].passed,
          };
          await json(attempt, info);
        }
        assert.deepEqual(info.servedModels, [control.model]);
        if (info.error && !/Public (tests|compilation) failed/.test(info.error))
          throw Error(info.error);
        const after = await grade(
            root,
            "private",
            join(stage, "after.json"),
            group,
          ),
          pub = await grade(root, "public", join(stage, "public.json"), group);
        await git(root, ["add", "--", "sympy"]);
        await git(root, [...commitOptions, "-m", "Checkpoint " + group]);
        const commit = await git(root, ["rev-parse", "HEAD"]);
        const files = (await git(root, ["diff", "--name-only", before, commit]))
          .split("\n")
          .filter(Boolean);
        assert(files.every((p) => writable.includes(p)));
        const row = {
          group,
          before,
          commit,
          files,
          prior: info.prior,
          after: after.groups[group].passed,
          checks: after.groups[group].checks,
          public: pub.groups[group].passed,
          turns: info.agent.turns,
          returnedFailure: info.agent.returnedFailure,
          usage: info.usage,
          servedModels: info.servedModels,
          error: info.error,
          elapsedSeconds: info.elapsedSeconds,
        };
        await json(done, row);
        stages.push(row);
        console.log("END", arm, group, row.prior, row.after, files.length);
      }
      const candidate = join(dir, "submission");
      cpSync(root, candidate, {
        recursive: true,
        filter: (p) => !/[\\/]\.git$/.test(p),
      });
      const grades = {
        public: await grade(
          candidate,
          "public",
          join(dir, "public.json"),
          undefined,
          true,
        ),
        private: await grade(
          candidate,
          "private",
          join(dir, "private.json"),
          undefined,
          true,
        ),
      };
      const usage = Object.fromEntries(
        [
          "totalTokens",
          "inputTokens",
          "outputTokens",
          "cachedInputTokens",
          "requests",
        ].map((k) => [k, stages.reduce((s, x) => s + x.usage[k], 0)]),
      );
      await json(join(dir, "agent.json"), { stages });
      await json(final, {
        ...control,
        arm,
        candidate,
        work: dir,
        stages,
        grades,
        usage,
        turns: stages.reduce((s, x) => s + x.turns, 0),
        executionSeconds: stages.reduce((s, x) => s + x.elapsedSeconds, 0),
        stop: "all 15 families checked",
        agentFinal: "family handoffs",
        servedModels: [control.model],
      });
    }),
  );
  await index.close();
  for (const r of finish) if (r.status === "rejected") throw r.reason;
}
