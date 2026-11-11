import type { Check } from "../real-projects/types.ts";

type Cases = { name: string; passed: boolean }[];
type Graded = Pick<Check, "id" | "passed" | "cases">;

export interface CheckScore {
  id: string;
  passed: boolean;
  casesPassed: number;
  casesTotal: number;
}

export interface CaseScore {
  /** Fraction of golden test cases passed (0..1); the primary partial-credit metric. */
  score: number;
  casesPassed: number;
  casesTotal: number;
  /**
   * Gain over the starter baseline: (passed - starterPassed) / (total - starterPassed),
   * clamped to 0..1. Cases the empty skeleton already passes earn no credit.
   */
  gain: number;
  /** Mean of per-module-check case pass rates (each module weighted equally). */
  moduleScore: number;
  checks: CheckScore[];
}

/**
 * Score a graded run against the golden run. The denominator is the set of
 * test-case names that pass in the golden control, so a submission that fails
 * to compile (and therefore reports no cases) scores 0 rather than undefined,
 * and extra/renamed cases never inflate the score.
 */
export function caseScore(
  checks: Graded[],
  golden: Graded[],
  starter?: Graded[],
): CaseScore {
  const out: CheckScore[] = [];
  let baseline = 0;
  for (const g of golden) {
    const expected = (g.cases ?? []).filter((c) => c.passed).map((c) => c.name);
    const got = new Map<string, boolean>(
      (checks.find((c) => c.id === g.id)?.cases ?? []).map((c) => [c.name, c.passed]),
    );
    const total = expected.length;
    const base = new Map<string, boolean>(
      (starter?.find((c) => c.id === g.id)?.cases ?? []).map((c) => [c.name, c.passed]),
    );
    baseline += expected.filter((n) => base.get(n) === true).length;
    const passed = expected.filter((n) => got.get(n) === true).length;
    out.push({ id: g.id, passed: Boolean(checks.find((c) => c.id === g.id)?.passed), casesPassed: passed, casesTotal: total });
  }
  const casesTotal = out.reduce((s, c) => s + c.casesTotal, 0);
  const casesPassed = out.reduce((s, c) => s + c.casesPassed, 0);
  const rated = out.filter((c) => c.casesTotal > 0);
  const headroom = casesTotal - baseline;
  return {
    gain: headroom > 0 ? Math.min(1, Math.max(0, (casesPassed - baseline) / headroom)) : 0,
    score: casesTotal ? casesPassed / casesTotal : 0,
    casesPassed,
    casesTotal,
    moduleScore: rated.length
      ? rated.reduce((s, c) => s + c.casesPassed / c.casesTotal, 0) / rated.length
      : 0,
    checks: out,
  };
}
