"""Run the pinned upstream pytest corpus against one CAS implementation."""

import argparse
from collections import Counter
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import zipfile


def stage_tests(archive, commit, stage, packages):
    metadata = {"conftest.py", "sympy/conftest.py", "pyproject.toml",
                ".ci/blacklisted.json", ".ci/durations.json"}
    selected = []
    prefix = f"sympy-{commit}/"
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            if info.is_dir() or not info.filename.startswith(prefix):
                continue
            name = info.filename[len(prefix):]
            parts = name.split("/")
            # Stage test helpers from the entire release. Selected suites
            # occasionally import fixtures or generators from another package.
            test_asset = parts[0] == "sympy" and "tests" in parts[1:-1]
            if test_asset or name in metadata:
                dest = stage / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(bundle.read(info))
            if test_asset and parts[1] in packages and parts[-1].startswith("test_") and name.endswith(".py"):
                selected.append(name)
    return sorted(selected)


class StagedTests:
    """Resolve SymPy test packages against the evaluator's private overlay."""

    def find_spec(self, fullname, path, target=None):
        if fullname.startswith("sympy.") and fullname.endswith(".tests"):
            init = Path.cwd().joinpath(*fullname.split("."), "__init__.py")
            if init.is_file():
                return importlib.util.spec_from_file_location(fullname, init)
        return None


class Outcomes:
    def __init__(self):
        self.counts = Counter()
        self.skips = Counter()
        self.failures = []
        self.collected = 0

    def pytest_collection_finish(self, session):
        self.collected = len(session.items)

    def record(self, report, outcome):
        self.counts[outcome] += 1
        if outcome == "skipped":
            reason = report.longrepr
            self.skips[str(reason[2] if isinstance(reason, tuple) else reason)] += 1
        if outcome in ("failed", "error", "collection_error"):
            self.failures.append({"node": report.nodeid, "detail": str(report.longrepr)[-650:]})

    def pytest_collectreport(self, report):
        if report.failed or report.skipped:
            self.record(report, "collection_error" if report.failed else "skipped")

    def pytest_runtest_logreport(self, report):
        if hasattr(report, "wasxfail"):
            self.record(report, "xfailed" if report.skipped else "xpassed")
        elif report.skipped:
            self.record(report, "skipped")
        elif report.failed:
            self.record(report, "failed" if report.when == "call" else "error")
        elif report.when == "call":
            self.record(report, "passed")


def worker(candidate, job, output):
    missing = [name for name in ("mpmath", "pytest", "hypothesis")
               if importlib.util.find_spec(name) is None]
    if missing:
        output.write_text(json.dumps({"missingDependencies": missing}), encoding="utf-8")
        return 4
    import pytest
    sys.path.insert(0, str(candidate))
    sys.meta_path.insert(0, StagedTests())
    sys._running_pytest = True  # Same as the upstream SymPy conftest.
    import sympy
    if Path(sympy.__file__).resolve() != candidate / "sympy" / "__init__.py":
        raise ImportError(f"SymPy did not load from {candidate}")
    outcomes = Outcomes()
    spec = json.loads(job.read_text(encoding="utf-8"))
    # Override upstream's default exclusion of slow and tooslow marks.
    opts = ["-c", "pyproject.toml", "-o", "addopts=", "--import-mode=importlib",
            "--continue-on-collection-errors", "-p", "_hypothesis_pytestplugin", "--tb=short", "-q"]
    if spec["collectOnly"]:
        opts.append("--collect-only")
    code = pytest.main([*opts, *spec["files"]], plugins=[outcomes])
    stage = Path.cwd()
    for name, module in list(sys.modules.items()):
        file = getattr(module, "__file__", None)
        if name.startswith("sympy.") and file and getattr(module, "__name__", "") == name:
            origin = Path(file).resolve()
            if not (origin.is_relative_to(candidate) or origin.is_relative_to(stage)):
                raise ImportError(f"{name} loaded from outside the candidate or staged tests: {origin}")
    result = {"collectedTests": outcomes.collected, "counts": dict(outcomes.counts), "skipReasons": dict(outcomes.skips),
              "failures": outcomes.failures, "pytestExit": int(code)}
    output.write_text(json.dumps(result, ensure_ascii=True), encoding="utf-8")
    return int(code)


def shard_arg(value):
    try:
        index, count = map(int, value.split("/"))
        if 1 <= index <= count:
            return index, count
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("expected a 1-based shard i/n with 1 <= i <= n")


def run_worker(cmd, stage, env, timeout):
    # A Windows venv launcher delegates to a child python.exe. Kill the entire
    # worker group before removing its staged tests if a deadline expires.
    with subprocess.Popen(cmd, cwd=stage, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          start_new_session=os.name != "nt") as proc:
        try:
            stdout, _ = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
            else:
                os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
            raise
    return subprocess.CompletedProcess(cmd, proc.returncode, stdout)


def main():
    import prepare

    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("candidate", type=Path, help="tree containing the implementation's sympy directory")
    cli.add_argument("--packages", nargs="+", default=prepare.PACKAGES, choices=prepare.PACKAGES)
    cli.add_argument("--shard", type=shard_arg, default=(1, 1), help="deterministic i/n split of sorted test files")
    cli.add_argument("--timeout", type=int, default=3600, help="wall seconds for this selection")
    cli.add_argument("--collect-only", action="store_true", help="check collection without executing tests")
    cli.add_argument("--base", type=Path, default=prepare.BASE, help="location of the frozen archive cache")
    cli.add_argument("--report", type=Path, help="JSON output, including all failure IDs and skip reasons")
    args = cli.parse_args()
    root = args.candidate.resolve()
    if not (root / "sympy/__init__.py").is_file() or args.timeout < 1:
        cli.error("supply a candidate containing sympy/__init__.py and a positive timeout")
    prepare.BASE = args.base.resolve()
    archive = prepare.frozen_archive()
    index, total = args.shard
    result = {"candidate": str(root), "commit": prepare.COMMIT, "packages": args.packages,
              "shard": f"{index}/{total}", "timeoutSeconds": args.timeout, "collectOnly": args.collect_only}
    with tempfile.TemporaryDirectory(prefix="cas-upstream-") as tmp:
        stage = Path(tmp)
        all_files = stage_tests(archive, prepare.COMMIT, stage, args.packages)
        chosen = all_files[index-1::total]
        result.update(totalSuiteFiles=len(all_files), selectedFiles=len(chosen))
        if not chosen:
            cli.error("shard selects zero files")
        job, output = stage / "job.json", stage / "outcomes.json"
        job.write_text(json.dumps({"files": chosen, "collectOnly": args.collect_only}), encoding="utf-8")
        cmd = [sys.executable, "-I", "-B", str(Path(__file__).resolve()), "--worker", str(root), str(job), str(output)]
        env = {**os.environ, "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1", "PYTEST_ADDOPTS": "",
               "PYTHONPATH": str(root), "SYMPY_GROUND_TYPES": "python"}
        started = time.monotonic()
        try:
            run = run_worker(cmd, stage, env, args.timeout)
            if output.is_file():
                result.update(json.loads(output.read_text(encoding="utf-8")))
            status = "passed" if run.returncode == 0 else "failed"
            if not output.is_file() or run.returncode not in (0, 1):
                status = "runner_error"
                if result.get("missingDependencies"):
                    status = "missing_dependencies"
                elif str(root).encode() in run.stdout and b"CAS reconstruction TODO" in run.stdout:
                    status = "candidate_setup_failed"
            result.update(status=status, exitCode=run.returncode)
            if status != "passed":
                result["diagnostic"] = run.stdout.decode(errors="replace")[-2000:]
        except subprocess.TimeoutExpired:
            result.update(status="timeout", exitCode=124)
        result["wallSeconds"] = round(time.monotonic() - started, 3)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "failures"}, indent=2))
    return result["exitCode"]


if __name__ == "__main__":
    if sys.argv[1:2] == ["--worker"]:
        sys.exit(worker(*map(Path, sys.argv[2:])))
    sys.exit(main())
