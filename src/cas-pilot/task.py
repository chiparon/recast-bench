"""Pack the solver input or grade a submission against the frozen writable scope."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from history import prepare_history
from prepare import BASE, HERE, sha


def check_target(root, freeze, original=False):
    files = {p.relative_to(root).as_posix(): p for p in root.rglob("*") if p.is_file()}
    expected = freeze["starterTree"]
    if set(files) != set(expected):
        raise ValueError(f"File inventory differs: {sorted(set(files) ^ set(expected))[:10]}")
    for key, path in files.items():
        if path.resolve() != (root / key) or path.is_symlink():
            raise ValueError(f"File must be local to the submitted tree: {key}")
        if (original or key not in freeze["writable"]) and sha(path.read_bytes()) != expected[key]:
            raise ValueError(f"Changed frozen file: {key}")


def pack(base, freeze, output=None):
    public = base / "public"
    target = public / "target"
    check_target(target, freeze, original=True)
    historical = prepare_history(base / "cache", public / "history")
    if historical != json.loads((HERE / "history-evidence.json").read_text()):
        raise ValueError("Historical tree does not match published inventory")
    destination = output.resolve() if output else base / "cas-reconstruction-v1.zip"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as temp:
        archive = Path(temp) / "solver.zip"
        with ZipFile(archive, "w") as bundle:
            for prefix in ("target", "history"):
                for path in sorted((public / prefix).rglob("*")):
                    if not path.is_file():
                        continue
                    info = ZipInfo(path.relative_to(public).as_posix())
                    info.create_system = 3
                    info.external_attr = 0o100644 << 16
                    bundle.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=6)
        with ZipFile(archive) as bundle:
            if bad := bundle.testzip():
                raise ValueError(f"Bad ZIP member: {bad}")
        archive.replace(destination)
    print(json.dumps({"archive": str(destination), "sha256": sha(destination.read_bytes()),
                      "bytes": destination.stat().st_size, "targetFiles": len(freeze["starterTree"]),
                      "historyFiles": historical["source_files"]}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, default=BASE)
    actions = parser.add_subparsers(dest="action", required=True)
    pack_cli = actions.add_parser("pack")
    pack_cli.add_argument("--output", type=Path)
    submit = actions.add_parser("grade")
    submit.add_argument("target", type=Path)
    submit.add_argument("--suite", choices=("public", "private"), default="private")
    submit.add_argument("--json", type=Path)
    args = parser.parse_args()
    base = args.base.resolve()
    freeze = json.loads((base / "private" / "freeze.json").read_text())
    if args.action == "pack":
        pack(base, freeze, args.output)
        return 0
    target = args.target.resolve()
    check_target(target, freeze)
    archive = base / "cache" / ("sympy-" + freeze["commit"] + ".zip")
    command = [sys.executable, "-B", str(HERE / "grade.py"), str(target),
               "--archive", str(archive), "--suite", args.suite]
    if args.json:
        command.extend(["--json", str(args.json)])
    return subprocess.run(command).returncode


if __name__ == "__main__":
    raise SystemExit(main())
