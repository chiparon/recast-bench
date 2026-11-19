import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import {
  Sag2Bm25IndexStore,
  ProjectAnalysisCoordinator,
  projectAnalysisObjective,
  projectPlanHash,
  searchModulesWithSag2,
} from "../../../weichai/services/code-intelligence-service/src/index.ts";
import { SeekDbProjection } from "../../../weichai/services/code-intelligence-service/src/seekdb-projection.ts";
import type { StructuralIndex } from "../../../weichai/packages/contracts/src/index.ts";

const sha = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const languages: Record<string, string> = {
  flint: "C",
  jas: "Java",
  abstractalgebra: "Julia",
  maxima: "Common Lisp",
};
export const families = {
  ntheory:
    "Integer arithmetic, prime factorization, primality tests, divisors, modular residues, Chinese remainder and congruences",
  polys:
    "Polynomial arithmetic on integer rational and finite fields, polynomial gcd, squarefree factorization, Groebner bases and polynomial rings",
  functions:
    "Elementary and special functions, factorial, trigonometric sine cosine, complex real and imaginary parts, exponential and logarithm",
  matrices:
    "Exact and sparse matrix arithmetic, determinant, row reduction, inverse, decomposition and linear systems",
  sets: "Symbolic sets, intervals, union and intersection, membership, finite sets",
  printing:
    "Format mathematical expressions with precedence, string printers, typesetting and LaTeX output",
  simplify:
    "Expression rewriting and simplification, trigonometric identities, rational normalization, radicals and powers",
  series: "Power series expansion, asymptotics, limits, orders and residues",
  concrete:
    "Symbolic summation, finite products, bounds, telescoping and Gosper algorithm",
  integrals:
    "Symbolic integration, rational integration, antiderivatives, definite integrals, Risch algorithm",
  solvers:
    "Solve polynomial and transcendental equations, inequalities, systems and solution sets",
  combinatorics:
    "Permutation groups, composition, group generators, orbits and Schreier Sims algorithms",
  tensor:
    "Multidimensional arrays, tensor product, permutation, contraction and indexed expressions",
  geometry:
    "Coordinate geometry, points, intersections of lines, polygons and circles",
  calculus:
    "Finite difference weights, derivatives, continuous domains, accumulation bounds and monotonicity",
};
export type Family = keyof typeof families;

export class FamilyIndex {
  store = new Sag2Bm25IndexStore();
  files = new Map<string, string>();
  counts: Record<string, number> = {};
  async build(root: string, lock: any, evidence: any) {
    for (const [i, repo] of lock.repositories.entries()) {
      const repositoryId = repo.directory,
        localPath = join(root, repositoryId),
        analysisRevision = repo.commit;
      const scope = { repositoryId, analysisRevision },
        projectId = "source",
        analysisHash = evidence.repositories[i].inventory_sha256,
        now = new Date().toISOString();
      const projectScope = { ...scope, projectId };
      const lang = languages[repositoryId];
      const index: StructuralIndex = {
        ...scope,
        analysisHash,
        files: [],
        projects: [
          {
            ...projectScope,
            kind: "library",
            displayName: repositoryId,
            relativePath: ".",
            manifestPaths: [],
            sourceRoots: ["."],
            testRoots: [],
            languageIds: [lang],
          },
        ],
        symbols: [],
        dependencyEdges: [],
        diagnostics: [],
      };
      const texts = new Map<string, string>(),
        modules = [];
      for (const relativePath of readdirSync(localPath, { recursive: true })
        .map(String)
        .map((p) => p.replaceAll("\\", "/"))
        .filter((p) => /\.(?:c|h|java|jl|lisp)$/.test(p))
        .sort()) {
        const raw = readFileSync(join(localPath, relativePath)),
          body = raw.toString("utf8"),
          id = sha(relativePath);
        this.files.set("history/" + repositoryId + "/" + relativePath, body);
        texts.set(relativePath, body);
        index.files.push({
          ...projectScope,
          fileId: id,
          relativePath,
          role: "source",
          languageId: lang,
          sha256: sha(raw),
          sizeBytes: raw.length,
          parseStatus: "unsupported",
        });
        const declarations = body
          .split("\n")
          .flatMap((line) => {
            const m =
              line.match(/^\s*\((?:defun|defmfun|defmacro)\s+([^\s()]+)/i) ??
              line.match(
                /^\s*(?:function|(?:mutable\s+)?struct|abstract type)\s+([\w.!]+)/,
              ) ??
              line.match(/^(?:[\w *]+\s+)?(\w{3,})\s*\([^;{}]*$/) ??
              line.match(/\b(?:class|interface)\s+(\w+)/);
            return m ? [m[1]] : [];
          })
          .filter(
            (x) => !["if", "for", "while", "return", "switch"].includes(x),
          );
        const name = basename(relativePath),
          coreApis = [...new Set(declarations)].slice(0, 16);
        const purpose = relativePath.replace(/[\/_.-]+/g, " ");
        modules.push({
          id,
          name,
          kind: "feature",
          purpose,
          description: [purpose, ...coreApis].join(" "),
          language: lang,
          sourceFiles: [relativePath],
          coreApis,
          symbolKeys: [],
          dependsOn: [],
          evidenceIds: ["file:" + id],
        });
      }
      assert.equal(texts.size, evidence.repositories[i].source_files);
      await this.store.putRepository({
        repositoryId,
        localPath,
        displayName: repositoryId,
        role: "history",
        analysisStatus: "ready",
        activeRevision: null,
        createdAt: now,
        updatedAt: now,
      });
      const revision = {
        ...scope,
        analysisHash,
        createdAt: now,
        indexerVersion: "cas-source-files-v1",
      };
      await this.store.putRevision({ ...revision, status: "building" });
      await this.store.putStructuralIndex(index, texts);
      await new SeekDbProjection(this.store).project(index, texts);
      await this.store.putRevision({
        ...revision,
        status: "ready",
        completedAt: now,
      });
      await this.store.activateRevision(scope);
      const proposal = {
        ...scope,
        analysisHash,
        objective: projectAnalysisObjective,
        summary: repositoryId + " source file modules",
        modules,
        unassignedFiles: [],
      };
      const coordinator = new ProjectAnalysisCoordinator({
        store: this.store,
        allowLargeAgentPlan: true,
        plan: async () => ({
          proposal,
          evidence: {
            ...scope,
            analysisHash,
            planHash: projectPlanHash(proposal),
            evidenceIds: index.files.map((f) => "file:" + f.fileId),
          },
        }),
      });
      await coordinator.ensure(projectScope, true);
      const state = await coordinator.read(projectScope);
      assert(
        state.state === "ready" && state.projection === "ready",
        state.error,
      );
      this.counts[repositoryId] = texts.size;
    }
  }
  async lookup(group: string, requirement: string, repo?: string) {
    const target = {
      id: group,
      name: group,
      kind: "module" as const,
      path: "sympy/" + group,
      signature: group,
      language: "Python" as const,
      module: {
        sourceFiles: [],
        coreApis: [],
        dependsOn: [],
        description: requirement,
        purpose: requirement,
      },
    };
    let hops = 0;
    const cs = await searchModulesWithSag2(
      this.store,
      {
        target,
        requirement,
        repositoryIds: repo ? [repo] : Object.keys(this.counts),
        topK: 3,
      },
      undefined,
      {
        maxHops: 2,
        expandOnBridgeTerms: true,
        observeDiagnostics: (d) => {
          hops = d.hopsExecuted;
        },
      },
    );
    return {
      query: requirement,
      hops,
      hits: cs.map((c) => ({
        id: c.id,
        path:
          "history/" +
          c.sourceModule!.repositoryId +
          "/" +
          c.sourceModule!.sourceFiles[0],
        score: c.score.overall,
        content: c.preview.slice(0, 2200),
      })),
    };
  }
  close() {
    return this.store.close();
  }
}
