"""Grade a SymPy candidate with the frozen 1.14.0 regression corpus."""
import argparse
import ast
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
from types import ModuleType
import zipfile


HERE = Path(__file__).resolve().parent
REV = "16fa855354eb7bcabd3fe10993841e03b1382692"
ARCHIVE = HERE.parents[1] / "work" / "cas-pilot" / "cache" / f"sympy-{REV}.zip"
PREFIX = f"sympy-{REV}/"
ARCHIVE_SHA256 = "5daac3107116df5659d7c20760fa6684773739089c120ecd6eca5ea4f355a02a"
# The release has two unmarked Gruntz functions with unconditional slow
# skips and a Python printer check requiring the optional NumPy runtime.
SKIPPED = {
    "sympy/series/tests/test_gruntz.py": {"test_gruntz_evaluation_slow", "test_gruntz_eval_special_slow"},
    "sympy/printing/tests/test_pycode.py": {"test_issue_18770"},
}

# Within each package, cover several independent algorithm families. A prefix
# before a test basename is its subpackage, e.g. "domains/domains".
MODULES = {
    "polys": "densearith densetools euclidtools factortools galoistools groebnertools polytools rings rootisolation domains/domains numberfields/minpoly matrices/domainmatrix",
    "matrices": "decompositions determinant eigen immutable matrices matrixbase normalforms reductions solvers sparse expressions/blockmatrix expressions/matexpr",
    "functions": "elementary/complexes elementary/exponential elementary/hyperbolic elementary/piecewise elementary/trigonometric combinatorial/comb_factorials combinatorial/comb_numbers special/bessel special/gamma_functions special/spec_polynomials",
    "integrals": "deltafunctions heurisch integrals intpoly manual prde rationaltools risch trigonometry",
    "solvers": "inequalities polysys recurr simplex solvers solveset diophantine/diophantine ode/ode ode/riccati",
    "simplify": "combsimp cse fu gammasimp hyperexpand powsimp radsimp ratsimp simplify sqrtdenest trigsimp",
    "series": "approximants formal fourier gruntz limits limitseq nseries order residues sequences series",
    "concrete": "delta gosper guess products sums_products",
    "ntheory": "continued_fraction digits egyptian_fraction factor_ generate modular multinomial partitions primetest residue",
    "combinatorics": "coset_table fp_groups free_groups generators group_constructs named_groups partitions perm_groups permutations subsets tensor_can",
    "tensor": "functions index_methods indexed tensor tensor_operators array/arrayop array/ndim_array array/expressions/array_expressions",
    "geometry": "curve ellipse entity geometrysets line parabola plane point polygon util",
    "sets": "conditionset contains fancysets ordinals powerset setexpr sets",
    "calculus": "accumulationbounds euler finite_diff singularities util",
    "printing": "c codeprinter fortran jscode latex mathml octave pycode repr rust str pretty/pretty",
}


def load_cases(archive, groups):
    cases = {}
    with archive.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != ARCHIVE_SHA256:
            raise ValueError("SymPy archive checksum mismatch")
    with zipfile.ZipFile(archive) as z:
        timings = json.loads(z.read(PREFIX + ".ci/durations.json"))
        blacklist = json.loads(z.read(PREFIX + ".ci/blacklisted.json"))
        for group in groups:
            modules = []
            for label in MODULES[group].split():
                parents, _, basename = label.rpartition("/")
                path = "/".join(filter(None, ("sympy", group, parents, "tests", f"test_{basename}.py")))
                source = z.read(PREFIX + path).decode("utf-8")
                excluded = {name for index in [blacklist, *timings] for name in index.get(path, [])}
                excluded.update(SKIPPED.get(path, ()))
                names = [fn.name for fn in ast.parse(source).body if isinstance(fn, ast.FunctionDef)
                         and fn.name.startswith("test_") and not fn.decorator_list
                         and not fn.args.args and fn.name not in excluded]
                # Stable, content-independent sampling from each selected test file.
                names.sort(key=lambda name: hashlib.sha256(f"{path}::{name}".encode()).digest())
                if names:
                    modules.append({"path": path, "source": source, "names": names[:8]})
            if not modules:
                raise ValueError(f"empty suite for {group}")
            cases[group] = modules
    return cases


def evaluate_worker(root):
    modules = json.load(sys.stdin)
    sys.path.insert(0, str(root))
    if coverage_dir := os.environ.get("CAS_PILOT_COVERAGE_DIR"):
        sys.path.insert(0, str(HERE))
        from reach import start
        start(root, Path(coverage_dir))
    import sympy
    if Path(sympy.__file__).resolve() != root / "sympy" / "__init__.py":
        raise ImportError(f"unexpected SymPy path {sympy.__file__}")
    from sympy.core.random import seed
    failures = {}
    for entry in modules:
        path = entry["path"]
        module = ModuleType(path[:-3].replace("/", "."))
        module.__package__ = module.__name__.rpartition(".")[0]
        module.__file__ = path
        try:
            exec(compile(entry["source"], path, "exec"), module.__dict__)
        except Exception as exc:
            for name in entry["names"]:
                failures[f"{path}::{name}"] = f"{type(exc).__name__}: {exc}"
            continue
        for name in entry["names"]:
            try:
                random.seed(7919)
                seed(7919)
                module.__dict__[name]()
            except Exception as exc:
                failures[f"{path}::{name}"] = f"{type(exc).__name__}: {exc}"
    print(json.dumps(failures, ensure_ascii=True))


def private_group(root, modules, timeout):
    total = sum(len(entry["names"]) for entry in modules)
    command = [sys.executable, "-I", "-B", str(Path(__file__).resolve()), "--worker", str(root)]
    if image := os.environ.get("CAS_PILOT_IMAGE"):
        from sandbox import container
        command = container(image, root, Path(__file__), "--worker", "/candidate")
    with tempfile.TemporaryDirectory() as cwd:
        try:
            child = subprocess.run(command, cwd=cwd, input=json.dumps(modules), encoding="utf-8",
                                   errors="replace", capture_output=True, timeout=timeout)
            if child.returncode:
                raise RuntimeError((child.stderr or child.stdout).strip()[-1200:])
            failures = json.loads(child.stdout.strip().splitlines()[-1])
        except (subprocess.TimeoutExpired, RuntimeError, ValueError, IndexError) as exc:
            return {"checks": total, "passed": 0, "failed": total, "error": str(exc)}
    return {"checks": total, "passed": total - len(failures), "failed": len(failures),
            "failures": failures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--suite", choices=["public", "private"], default="public")
    parser.add_argument("--group", choices=MODULES, action="append")
    parser.add_argument("--archive", type=Path, default=ARCHIVE)
    parser.add_argument("--timeout", type=int, default=180, help="time limit in seconds per worker")
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    if not (root / "sympy" / "__init__.py").is_file():
        parser.error(f"missing candidate package in {root}")
    if args.timeout < 1 or args.jobs < 1:
        parser.error("jobs and timeout must be positive")
    groups = list(dict.fromkeys(args.group or MODULES))
    if args.suite == "public":
        command = [sys.executable, "-I", "-B", str(HERE / "smoke.py"), str(root)]
        if image := os.environ.get("CAS_PILOT_IMAGE"):
            from sandbox import container
            command = container(image, root, HERE / "smoke.py", "/candidate")
        for name in groups:
            command.extend(["--group", name])
        try:
            proc = subprocess.run(command, capture_output=True, timeout=args.timeout, encoding="utf-8",
                                  errors="replace")
            result = json.loads(proc.stdout.strip().splitlines()[-1])
        except (subprocess.TimeoutExpired, ValueError, IndexError) as exc:
            result = {"suite": "public", "score": 0, "groups": {
                name: {"checks": 1, "passed": 0, "failed": 1, "error": str(exc)}
                for name in groups}}
    else:
        try:
            cases = load_cases(args.archive, groups)
        except (OSError, KeyError, ValueError, zipfile.BadZipFile) as exc:
            parser.error(f"invalid evaluator archive: {exc}")
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            reports = pool.map(lambda group: private_group(root, cases[group], args.timeout), groups)
            by_group = dict(zip(groups, reports))
        score = sum(report["passed"] / report["checks"] for report in by_group.values()) / len(groups)
        result = {"suite": "private", "score": score, "groups": by_group}
    output = json.dumps(result, ensure_ascii=True, indent=2)
    if args.json:
        args.json.write_text(output + "\n", encoding="utf-8")
    print(output)
    return int(result["score"] < 1)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--worker"]:
        evaluate_worker(Path(sys.argv[2]).resolve())
    else:
        raise SystemExit(main())
