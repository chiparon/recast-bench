"""Replay the shipped skeleton and restore exactly its declared writable files."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from prepare import BASE, HERE, sha
from task import check_target


def evaluate(base, candidate, suite, temp):
    report = temp / "grade.json"
    proc = subprocess.run([sys.executable, "-B", str(HERE / "task.py"), "--base", str(base),
                           "grade", str(candidate), "--suite", suite, "--json", str(report)],
                          capture_output=True, text=True, errors="replace")
    if not report.is_file() or proc.returncode not in (0, 1):
        raise RuntimeError(proc.stderr[-1800:] or proc.stdout[-1800:])
    outcome = json.loads(report.read_text())
    report.unlink()
    groups = {key: [group["passed"], group["checks"]] for key, group in outcome["groups"].items()}
    return {"score": outcome["score"], "passed": sum(pair[0] for pair in groups.values()),
            "checks": sum(pair[1] for pair in groups.values()), "groups": groups}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, default=BASE)
    parser.add_argument("--json", type=Path, required=True)
    args = parser.parse_args()
    base = args.base.resolve()
    os.environ["SYMPY_GROUND_TYPES"] = "python"
    freeze = json.loads((base / "private" / "freeze.json").read_text())
    starter = base / "public" / "target"
    check_target(starter, freeze, original=True)
    results = {}
    with tempfile.TemporaryDirectory(dir=base / "private") as temp:
        stage = Path(temp)
        candidate = stage / "target"
        shutil.copytree(starter, candidate)
        for state in ("starter", "restored"):
            if state == "restored":
                for key, item in freeze["writable"].items():
                    data = (base / "private" / "golden" / key).read_bytes()
                    if sha(data) != item["golden"]:
                        raise ValueError(f"Incorrect oracle: {key}")
                    (candidate / key).write_bytes(data)
            results[state] = {suite: evaluate(base, candidate, suite, stage)
                              for suite in ("public", "private")}
    for suite in ("public", "private"):
        if results["restored"][suite]["score"] != 1 or results["starter"][suite]["score"] >= 1:
            raise ValueError(f"Controls did not distinguish starter and oracle: {suite}")
    evidence = {k: v for k, v in freeze.items() if k not in ("starterTree", "writable")}
    evidence["python"] = sys.version.split()[0]
    evidence["groupCountsFormat"] = "[passed, total]"
    evidence["controls"] = results
    args.json.write_bytes((json.dumps(evidence, indent=2) + "\n").encode())
    for state, suites in results.items():
        print(state, {k: f"{v['passed']}/{v['checks']}" for k, v in suites.items()})


if __name__ == "__main__":
    main()
