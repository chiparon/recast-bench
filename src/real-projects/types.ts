export interface Command {
  executable: string;
  args: string[];
  timeoutMs: number;
}
export interface Check {
  id: string;
  passed: boolean;
  error?: string;
  /** Optional per-test-case results for partial-credit scoring. */
  cases?: { name: string; passed: boolean }[];
}
export interface RealFixture {
  id: string;
  title: string;
  upstream: { url: string; commit: string };
  requirement: string;
  modules: {
    name: string;
    path: string;
    description: string;
    dependsOn?: string[];
    language?: string;
  }[];
  references: string[];
  compile: Command;
  test: Command;
  moduleTests?: Record<string, Command>;
  prepare(root: string, variant: "starter" | "golden"): Promise<void>;
  grade(root: string): Promise<Check[]>;
  productionFiles(path: string): boolean;
}
