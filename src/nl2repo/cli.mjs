import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const [command, ...args] = process.argv.slice(2);
const scripts = { prepare: "prepare.py", controls: "evaluate.py", report: "report.py" };
const python = process.env.RECAST_BENCH_PYTHON || "python";
const invocation = command === "test"
  ? ["-B", "-m", "unittest", "discover", "-s", "src/nl2repo", "-p", "test_*.py", ...args]
  : ["-B", fileURLToPath(new URL(scripts[command] || "invalid", import.meta.url)), ...args];
if (command !== "test" && !scripts[command]) throw Error("Unknown NL2Repo command");
const result = spawnSync(python, invocation, { stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (command === "test" && process.exitCode === 0) {
  const snapshots = spawnSync(process.execPath, [...process.execArgv, "--test", "src/nl2repo/inputs.test.ts"],
    { stdio: "inherit", windowsHide: true });
  if (snapshots.error) throw snapshots.error;
  process.exitCode = snapshots.status ?? 1;
}
