import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { PROJECT_MODELS } from "../project-bench/providers.ts";
import { gradeDelivery } from "../real-projects/grading.ts";
import { sha } from "../real-projects/inputs.ts";
import { sumUsage } from "../large-projects/meter.ts";
import { priceRequests, RATE_CARD } from "../large-projects/billing.ts";
import { fixtures } from "./cases.ts";
import {
  arms,
  batchName,
  existing,
  protocolFingerprint,
  resultsRoot,
  workRoot,
} from "./protocol.ts";
import { freezePoly, indexedHistoryStats, polyScope } from "./scope.ts";
import { caseScore } from "./score.ts";

const { values } = parseArgs({
  options: {
    batch: { type: "string", default: batchName },
    replay: { type: "boolean" },
    controls: { type: "boolean" },
  },
});
const batch = values.batch!;
assert(/^[\w-]+$/.test(batch));
const data = resultsRoot(batch),
  bundle = resolve("results", batch + "-evidence.json.gz");
const protocol = await protocolFingerprint();
const portable = values.replay
  ? JSON.parse(gunzipSync(await readFile(bundle)).toString("utf8"))
  : null;
const billingProtocol = {
  rateCard: RATE_CARD,
  implementationHash: sha(
    await readFile(resolve("src/large-projects/billing.ts")),
  ),
};
if (portable) {
  assert.deepEqual(portable.protocol, protocol);
  assert.deepEqual(portable.billingProtocol, billingProtocol);
}

const verdict = (checks: any[]) =>
  checks.map((c) => ({ id: c.id, passed: c.passed }));

await mkdir(workRoot, { recursive: true });
const controls = [];
const rows = [];
let passed = 0,
  requests = 0,
  tokens = 0;

const trialFiles = portable
  ? []
  : (await readdir(data).catch(() => [] as string[])).filter((p) =>
      p.endsWith(".trial.json"),
    );

for (const f of fixtures) {
  const fresh = await mkdtemp(join(workRoot, "verify-"));
  try {
    const { m } = await freezePoly(f, fresh, "starter"),
      scope = await polyScope(f, fresh, m);
    const control = portable
      ? portable.controls.find((c: any) => c.taskId === f.id)
      : await existing(join(data, f.id + ".control.json"));
    assert(control, "Missing control record for " + f.id);
    if (!portable) {
      assert.equal(control.implementationHash, protocol.implementationHash);
      assert.equal(control.productRevision, protocol.productRevision);
      assert.equal(control.productDiff, protocol.productDiff);
    }
    assert.equal(control.treeHash, m.hash);
    assert.equal(control.inputHash, scope.inputHash);
    assert.equal(control.readableLines, scope.readableLines);
    assert.equal(control.physicalLines, scope.physicalLines);
    assert(
      control.controls.find((c: any) => c.variant === "golden")?.checks.every((x: any) => x.passed),
      "Golden control did not pass all checks for " + f.id,
    );
    assert(
      control.controls.find((c: any) => c.variant === "starter")?.checks.some((x: any) => !x.passed),
      "Starter control did not fail for " + f.id,
    );
    for (const mod of f.modules) {
      const ablated = control.controls.find(
        (c: any) => c.variant === "missing " + mod.path,
      );
      assert(
        ablated && ablated.checks.some((x: any) => !x.passed),
        `Missing ablation failure for ${mod.path} in ${f.id}`,
      );
    }
    const goldenChecks = control.controls.find((c: any) => c.variant === "golden").checks;
    const starterChecks = control.controls.find((c: any) => c.variant === "starter").checks;
    assert(
      goldenChecks.every((x: any) => x.cases?.length),
      "Golden control is missing per-case results for " + f.id,
    );
    assert(
      Object.keys(m.stats).length >= 5,
      "Expected >= 5 languages in multi-language reference pool for " + f.id,
    );
    assert.equal(
      control.sag2Recall?.length,
      f.modules.length,
      "Missing sag2Recall records for " + f.id,
    );
    const history = scope.task.fullHistoryRoot
      ? await indexedHistoryStats(fresh, m, control.indexedReferenceFiles)
      : undefined;
    if (history) assert.deepEqual(control.history, history);
    controls.push({
      history,
      taskId: f.id,
      title: f.title,
      granularity: f.id.endsWith("-l1") ? "L1" : "L2",
      upstream: f.upstream,
      inputHash: control.inputHash,
      treeHash: m.hash,
      files: control.files,
      languages: m.stats,
      physicalLines: scope.physicalLines,
      readableLines: scope.readableLines,
      readFiles: scope.task.readFiles.length,
      referenceFiles: scope.task.referenceFiles.length,
      indexedReferenceFiles: control.indexedReferenceFiles ?? [],
      crossLangTruthRefs: control.crossLangTruthRefs ?? [],
      distractorReferenceFiles: control.distractorReferenceFiles ?? [],
      sag2Recall: control.sag2Recall ?? [],
      writable: f.modules.map((mod) => mod.path),
      controls: control.controls.map((c: any) => ({
        variant: c.variant,
        checks: c.checks.map((x: { id: string; passed: boolean; cases?: unknown }) => ({
          id: x.id, passed: x.passed, cases: x.cases,
        })),
        score: caseScore(c.checks, goldenChecks, starterChecks),
      })),
    });

    if (!values.controls && (portable || trialFiles.length > 0)) {
      for (const model of PROJECT_MODELS) {
        for (const arm of arms) {
          const id = [f.id, model, arm].join("_");
          const row = portable
            ? portable.rows.find((r: any) => r.id === id)
            : await existing(join(data, id + ".trial.json"));
          if (!row) continue;
          assert.equal(row.inputHash, scope.inputHash);
          const usage = sumUsage(row.calls);
          assert.deepEqual(row.usage, usage);
          const price = priceRequests(row.calls);
          if (!portable && row.outputRoot) {
            const regraded = await gradeDelivery(
              f,
              fresh,
              m,
              row.outputRoot,
              row.commit,
            );
            assert.deepEqual(verdict(regraded.checks), verdict(row.grade.checks));
          }
          if (row.passed) passed++;
          requests += usage.requests;
          tokens += usage.totalTokens;
          rows.push({
            id,
            task: f.id,
            granularity: f.id.endsWith("-l1") ? "L1" : "L2",
            model,
            arm,
            inputHash: row.inputHash,
            passed: row.passed,
            commit: row.commit,
            error: row.error,
            gradingError: row.gradingError,
            wallMs: row.wallMs,
            executionMs: row.executionMs,
            indexMs: row.indexMs,
            usage,
            price,
            calls: row.calls,
            grade: row.grade
              ? {
                  passed: row.grade.passed,
                  integrityErrors: row.grade.integrityErrors,
                  checks: verdict(row.grade.checks),
                  score: caseScore(row.grade.checks, goldenChecks, starterChecks),
                }
              : null,
          });
        }
      }
    }
  } finally {
    await rm(fresh, { recursive: true, force: true });
  }
}

if (!portable) {
  await mkdir(dirname(bundle), { recursive: true });
  await writeFile(
    bundle,
    gzipSync(
      Buffer.from(
        JSON.stringify(
          {
            schema: 1,
            batch,
            verifiedAt: new Date().toISOString(),
            protocol,
            billingProtocol,
            controls,
            rows,
          },
          null,
          2,
        ),
      ),
    ),
  );
}
console.log(
  JSON.stringify({
    batch,
    replay: Boolean(portable),
    controlsVerified: controls.length,
    trialsVerified: rows.length,
    passed,
    requests,
    tokens,
    bundle,
  }),
);
