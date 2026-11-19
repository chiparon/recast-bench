"""Optional CPython 3.12 line and function reach on a reference evaluation."""
import argparse
import atexit
import collections
import json
import os
from pathlib import Path
import sys


def start(root, directory):
    directory.mkdir(parents=True, exist_ok=True)
    root = str(root.resolve()) + os.sep
    names = collections.defaultdict(set)
    lines = collections.defaultdict(set)
    monitor = sys.monitoring
    tool = monitor.COVERAGE_ID
    monitor.use_tool_id(tool, "cas-pilot")

    def visit(code, offset):
        if code.co_filename.startswith(root):
            names[code.co_filename].add((code.co_firstlineno, code.co_name))
        return monitor.DISABLE

    def line(code, number):
        if code.co_filename.startswith(root):
            lines[code.co_filename].add(number)
        return monitor.DISABLE

    monitor.register_callback(tool, monitor.events.PY_START, visit)
    monitor.register_callback(tool, monitor.events.LINE, line)
    monitor.set_events(tool, monitor.events.PY_START | monitor.events.LINE)

    @atexit.register
    def save():
        monitor.set_events(tool, 0)
        result = {Path(path).relative_to(root).as_posix():
                  {"definitions": sorted(names[path]), "lines": sorted(lines[path])}
                  for path in set(lines) | set(names)}
        (directory / f"{os.getpid()}.json").write_text(json.dumps(result), encoding="utf-8")


def summarize(golden, freeze, directory, report):
    from prepare import HERE, excise, sha
    metadata = json.loads(freeze.read_text())
    bootstrap = json.loads((HERE / "bootstrap.json").read_text())
    counts = collections.defaultdict(collections.Counter)
    seen_lines, seen_defs = collections.defaultdict(set), collections.defaultdict(set)
    traces = list(directory.glob("*.json"))
    if len(traces) != len(metadata["packages"]):
        raise ValueError("Expected one completed private grader worker trace per package")
    for trace in traces:
        for key, entry in json.loads(trace.read_text()).items():
            seen_lines[key].update(entry["lines"])
            seen_defs[key].update(tuple(item) for item in entry["definitions"])
    for key, frozen in metadata["writable"].items():
        scope = {}
        source = (golden / key).read_bytes()
        if sha(source) != frozen["golden"]:
            raise ValueError(f"Incorrect golden: {key}")
        _, loc, bodies = excise(source, bootstrap.get(key, []), scope)
        counts[key.split("/")[1]].update(
            bodies=bodies, removedCodeLines=loc,
            reachedBodies=len(seen_defs[key] & scope["definitions"]),
            reachedCodeLines=len(seen_lines[key] & scope["lines"]),
        )
    total = sum(counts.values(), collections.Counter())
    if total["removedCodeLines"] != metadata["removedCodeLines"] or total["bodies"] != metadata["bodies"]:
        raise ValueError("Reach denominator differs from frozen task")
    data = {"metric": "Distinct masked source lines with a CPython LINE event and masked outer functions entered during gold private grading. Multiline expressions may emit a single line event.",
            "total": total, "packages": dict(sorted(counts.items()))}
    report.write_bytes((json.dumps(data, indent=2) + "\n").encode())
    print(dict(total))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("golden", "freeze", "directory", "report"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    summarize(**vars(args))
