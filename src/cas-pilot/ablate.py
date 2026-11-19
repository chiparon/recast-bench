"""Measure the effect of replacing one SymPy package at a time on the gold tree."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import traceback

HERE = Path(__file__).resolve().parent
BASE = HERE.parents[1] / "work" / "cas-pilot"


def probe(root, groups):
    # Load the curator's checks before putting a candidate on the import path.
    sys.path.insert(0, str(HERE))
    from smoke import CHECKS

    sys.path.insert(0, str(root))
    result = {"imported": False, "groups": {}}
    try:
        import sympy
        if Path(sympy.__file__).resolve() != root / "sympy" / "__init__.py":
            raise ImportError("SymPy was imported from outside the candidate")
        result["imported"] = True
    except Exception as exc:
        result["importError"] = f"{type(exc).__name__}: {exc}"
    for group in groups:
        if not result["imported"]:
            result["groups"][group] = {"passed": False, "error": result["importError"]}
            continue
        try:
            passed = bool(CHECKS[group](sympy, sympy.Symbol("x")))
            result["groups"][group] = {"passed": passed}
            if not passed:
                result["groups"][group]["error"] = "unexpected result"
        except Exception as exc:
            frames = traceback.extract_tb(exc.__traceback__)
            locations = [f"{Path(frame.filename).relative_to(root).as_posix()}:{frame.lineno}"
                         for frame in frames if Path(frame.filename).is_relative_to(root)]
            result["groups"][group] = {"passed": False, "error": f"{type(exc).__name__}: {exc}",
                                       "location": locations[-1] if locations else None}
    print(json.dumps(result))


def run_probe(root, groups):
    env = {**os.environ, "SYMPY_GROUND_TYPES": "python"}
    proc = subprocess.run([sys.executable, "-I", "-B", str(Path(__file__).resolve()),
                           "--probe", str(root), *groups], env=env, capture_output=True,
                          encoding="utf-8", cwd=root, timeout=90, check=True)
    return json.loads(proc.stdout)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, default=BASE)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    base = args.base.resolve()
    gold = base / "private" / "golden"
    starter = base / "public" / "target"
    freeze = json.loads((base / "private" / "freeze.json").read_text(encoding="utf-8"))
    paths = {name: [] for name in freeze["packages"]}
    for rel, record in freeze["writable"].items():
        if digest(gold / rel) != record["golden"] or digest(starter / rel) != record["starter"]:
            raise ValueError(f"changed frozen writable file: {rel}")
        paths[Path(rel).parts[1]].append(rel)

    golden = run_probe(gold, list(paths))
    result = {"task": freeze["task"], "commit": freeze["commit"], "starterSHA256": freeze["starterSHA256"],
              "suite": "public", "probeSHA256": digest(HERE / "smoke.py"),
              "python": sys.version.split()[0], "groundTypes": "python", "groups": {}}
    with tempfile.TemporaryDirectory(dir=base / "private") as tmp:
        # Make a plain copy so writes during an ablation cannot affect frozen inputs.
        candidate = Path(tmp) / "candidate"
        shutil.copytree(gold, candidate)
        for name, files in paths.items():
            for rel in files:
                shutil.copyfile(starter / rel, candidate / rel)
            observed = run_probe(candidate, [name])
            for rel in files:
                shutil.copyfile(gold / rel, candidate / rel)
            positive = {"imported": golden["imported"], **golden["groups"][name]}
            negative = {"imported": observed["imported"], **observed["groups"][name]}
            result["groups"][name] = {"filesReplaced": len(files), "golden": positive,
                                      "ablated": negative, "detected": positive["passed"] and not negative["passed"]}
    result["detected"] = sum(item["detected"] for item in result["groups"].values())
    result["total"] = len(paths)
    output = json.dumps(result, indent=2) + "\n"
    if args.json:
        args.json.write_text(output, encoding="utf-8")
    print(output, end="")
    return int(result["detected"] != result["total"])


if __name__ == "__main__":
    if sys.argv[1:2] == ["--probe"]:
        probe(Path(sys.argv[2]).resolve(), sys.argv[3:])
    else:
        raise SystemExit(main())
