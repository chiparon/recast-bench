"""Materialize the SymPy reconstruction task from the immutable release archive."""
import argparse
import ast
import bisect
import collections
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import tokenize
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
BASE = HERE.parents[1] / "work" / "cas-pilot"
COMMIT = "16fa855354eb7bcabd3fe10993841e03b1382692"
DIGEST = "5daac3107116df5659d7c20760fa6684773739089c120ecd6eca5ea4f355a02a"
PACKAGES = "calculus combinatorics concrete functions geometry integrals matrices ntheory polys printing series sets simplify solvers tensor".split()
MARKER = b'raise NotImplementedError("CAS reconstruction TODO")'
IGNORE = {"tests", "benchmarks", "test-examples", "__pycache__"}
SKIP_TOKENS = {tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE, tokenize.INDENT,
               tokenize.DEDENT, tokenize.ENDMARKER, tokenize.ENCODING}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def frozen_archive():
    path = BASE / "cache" / f"sympy-{COMMIT}.zip"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with tempfile.TemporaryDirectory(dir=path.parent) as folder:
            download = Path(folder) / "download"
            subprocess.run(["curl", "-fLsS", "--retry", "2", "-o", str(download),
                            f"https://codeload.github.com/sympy/sympy/zip/{COMMIT}"], check=True)
            if sha(download.read_bytes()) != DIGEST:
                raise ValueError("SymPy download SHA-256 mismatch")
            os.replace(download, path)
    if sha(path.read_bytes()) != DIGEST:
        raise ValueError(f"Unexpected SymPy archive: {path}")
    return path


def implementation_bodies(tree):
    """Outermost function bodies, leaving declarations and leading docstrings."""
    for child in ast.iter_child_nodes(tree):
        if not isinstance(child, FUNCTIONS):
            yield from implementation_bodies(child)
            continue
        body = child.body
        if ast.get_docstring(child, clean=False) is not None:
            body = body[1:]
        if not body or (len(body) == 1 and isinstance(body[0], ast.Pass)):
            continue
        first = body[0]
        yield first, body[-1], child


def excise(data, executed, scope=None):
    source = data.decode("utf-8")
    tree = ast.parse(source)
    lines = data.splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    touched = []
    definitions = set()
    for first, last, func in implementation_bodies(tree):
        start_line = min([func.lineno] + [d.lineno for d in func.decorator_list])
        index = bisect.bisect_left(executed, start_line)
        if index < len(executed) and executed[index] <= last.end_lineno:
            continue
        # A nested decorated definition can be the first statement in a body.
        first_line = first.lineno
        column = first.col_offset
        if getattr(first, "decorator_list", None):
            first_line = min(d.lineno for d in first.decorator_list)
        start = offsets[first_line - 1] + column
        end = offsets[last.end_lineno - 1] + last.end_col_offset
        if isinstance(first, ast.Raise) and first == last and "NotImplemented" in ast.unparse(first):
            continue
        touched.append((start, end))
        definitions.add((start_line, func.name))
    if not touched:
        return data, 0, 0
    # Count physical lines carrying original code tokens wholly inside replaced spans.
    # Exclude docstrings (including nested ones) and count multiline literals once.
    doc_positions = {(node.body[0].lineno, node.body[0].col_offset) for node in ast.walk(tree)
                     if isinstance(node, (ast.Module, ast.ClassDef, *FUNCTIONS)) and
                     ast.get_docstring(node, clean=False) is not None}
    touched.sort()
    code_lines = set()
    index = 0
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type in SKIP_TOKENS:
            continue
        row, col = token.start
        col = len(lines[row - 1].decode("utf-8")[:col].encode("utf-8"))
        pos = offsets[row - 1] + col
        while index < len(touched) and touched[index][1] <= pos:
            index += 1
        if index == len(touched):
            break
        if touched[index][0] <= pos and (row, col) not in doc_positions:
            code_lines.add(row)
    if scope is not None:
        scope.update(lines=code_lines, definitions=definitions)
    chunks = []
    previous = 0
    for start, end in touched:
        chunks.extend([data[previous:start], MARKER])
        previous = end
    changed = b"".join([*chunks, data[previous:]])
    compile(changed, "<starter>", "exec")
    return changed, len(code_lines), len(touched)


def extract(archive, root):
    prefix = f"sympy-{COMMIT}/"
    with ZipFile(archive) as bundle:
        for info in bundle.infolist():
            name = info.filename.removeprefix(prefix)
            parts = Path(name).parts
            if info.is_dir() or (name != "LICENSE" and not name.startswith("sympy/")):
                continue
            if set(parts) & IGNORE or Path(name).name.startswith("test_"):
                continue
            out = root / name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(bundle.read(info))


def tree_digest(files):
    return sha("".join(f"{key}\t{val}\n" for key, val in sorted(files.items())).encode())


def build():
    public = BASE / "public"
    oracle = BASE / "private" / "golden"
    starter = public / "target"
    # Refuse to overwrite a participant submission. Existing output is usable as-is.
    for folder in (starter, oracle, BASE / "private" / "freeze.json"):
        if folder.exists():
            raise SystemExit(f"Output exists: {folder}. Use a fresh --base for a new freeze.")
    archive = frozen_archive()
    with tempfile.TemporaryDirectory(dir=BASE) as tmp:
        stage = Path(tmp)
        gold = stage / "golden"
        target = stage / "target"
        extract(archive, gold)
        # The bootstrap trace is measured once and frozen, so every host gets the same task.
        bootstrap = json.loads((HERE / "bootstrap.json").read_text())
        records, package_stats, tree = {}, collections.defaultdict(collections.Counter), {}
        for original in sorted(p for p in gold.rglob("*") if p.is_file()):
            path = original.relative_to(gold)
            key = path.as_posix()
            data = original.read_bytes()
            changed = data
            if len(path.parts) >= 3 and path.parts[1] in PACKAGES and path.suffix == ".py" and path.name != "__init__.py":
                changed, code, bodies = excise(data, bootstrap.get(key, []))
                if bodies:
                    records[key] = {"removedCodeLines": code, "bodies": bodies,
                                    "golden": sha(data), "starter": sha(changed)}
                    package_stats[path.parts[1]].update(files=1, removedCodeLines=code, bodies=bodies)
            dest = target / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(changed)
            tree[key] = sha(changed)
        missing = sum(g["removedCodeLines"] for g in package_stats.values())
        if missing < 100000:
            raise ValueError(f"Only {missing} removed production code lines")
        for filename in ("TASK.md", "smoke.py"):
            (target / filename).write_bytes((HERE / filename).read_text(encoding="utf-8").encode())
            tree[filename] = sha((target / filename).read_bytes())
        (target / "writable.json").write_bytes(json.dumps(sorted(records), indent=2).encode() + b"\n")
        tree["writable.json"] = sha((target / "writable.json").read_bytes())
        result = {"task": "cas-reconstruction-v1", "commit": COMMIT, "archiveSHA256": DIGEST,
                  "starterSHA256": tree_digest(tree), "removedCodeLines": missing,
                  "bodies": sum(row["bodies"] for row in records.values()), "files": len(records),
                  "packages": dict(sorted(package_stats.items())), "writable": records, "starterTree": tree}
        oracle.parent.mkdir(parents=True, exist_ok=True)
        public.mkdir(parents=True, exist_ok=True)
        gold.rename(oracle)
        target.rename(starter)
        (oracle.parent / "freeze.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in ("writable", "starterTree")}, indent=2))


def trace_bootstrap():
    # For curator regeneration on CPython 3.12 with the pinned dependency set.
    with tempfile.TemporaryDirectory(dir=BASE) as temp:
        root = Path(temp).resolve()
        extract(frozen_archive(), root)
        sys.path.insert(0, str(root))
        calls = set()
        def profile(frame, event, arg):
            if event == "call" and frame.f_code.co_name not in ("<module>", "<listcomp>", "<setcomp>", "<dictcomp>", "<genexpr>"):
                calls.add((frame.f_code.co_filename, frame.f_code.co_firstlineno))
        sys.setprofile(profile)
        try:
            import sympy
            assert Path(sympy.__file__).is_relative_to(root)
        finally:
            sys.setprofile(None)
        visited = collections.defaultdict(set)
        for filename, line in calls:
            path = Path(filename)
            if path.is_relative_to(root):
                rel = path.relative_to(root)
                if len(rel.parts) >= 3 and rel.parts[1] in PACKAGES:
                    visited[rel.as_posix()].add(line)
        print(json.dumps({k: sorted(v) for k, v in sorted(visited.items())}, separators=(",", ":")))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, default=BASE)
    parser.add_argument("--trace-bootstrap", action="store_true")
    args = parser.parse_args()
    BASE = args.base.resolve()
    BASE.mkdir(parents=True, exist_ok=True)
    if args.trace_bootstrap:
        trace_bootstrap()
    else:
        build()
