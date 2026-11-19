"""Prepare the read-only, cross-language reference corpus for the CAS task."""

import argparse
import fnmatch
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import urllib.request
import zipfile


HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / "work" / "cas-pilot"
EXCLUDED = {"test", "tests", "doc", "docs", "profile", "tune", "examples"}


def file_sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def frozen_archive(repo, cache):
    path = cache / (repo["commit"] + ".zip")
    if not path.exists():
        url = f"https://codeload.github.com/{repo['repository']}/zip/{repo['commit']}"
        with tempfile.TemporaryDirectory(dir=cache) as tmp:
            download = Path(tmp) / "archive.zip"
            with urllib.request.urlopen(url, timeout=120) as source, download.open("wb") as dest:
                shutil.copyfileobj(source, dest)
            if file_sha256(download) != repo["zip_sha256"]:
                raise ValueError(f"download differs from the pinned archive for {repo['repository']}")
            download.replace(path)
    elif file_sha256(path) != repo["zip_sha256"]:
        raise ValueError(f"corrupt cache entry {path}")
    return path


def is_production(path, repo):
    return (
        path.suffix in repo["extensions"]
        and not EXCLUDED.intersection(path.parts)
        and "Example" not in path.name
        and any(fnmatch.fnmatchcase(path.as_posix(), rule) for rule in repo["sources"])
    )


def render_repository(repo, archive, tree, verify):
    files = lines = nonblank = 0
    inventory = hashlib.sha256()
    paths = set()
    topics = {p for anchors in repo["topics"].values() for p in anchors}
    required = topics | set(repo["licenses"])
    with zipfile.ZipFile(archive) as source:
        for info in sorted(source.infolist(), key=lambda entry: entry.filename):
            if info.is_dir():
                continue
            path = PurePosixPath(*PurePosixPath(info.filename).parts[1:])
            name = path.as_posix()
            production = is_production(path, repo)
            if not production and name not in repo["licenses"]:
                continue
            data = source.read(info)
            dest = tree / repo["directory"] / path
            if verify:
                if not dest.is_file() or dest.read_bytes() != data:
                    raise ValueError(f"public history differs from pinned source at {dest}")
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
            digest = hashlib.sha256(data).hexdigest()
            inventory.update(f"{name}\t{digest}\n".encode())
            paths.add(name)
            if production:
                source_lines = data.splitlines()
                lines += len(source_lines)
                nonblank += sum(bool(line.strip()) for line in source_lines)
                files += 1
    if missing := required - paths:
        raise ValueError(f"missing license or topic anchor in {repo['repository']}: {sorted(missing)}")
    evidence = {
        "repository": repo["repository"], "commit": repo["commit"], "language": repo["language"],
        "source_files": files, "physical_lines": lines, "nonblank_source_lines": nonblank,
        "license_and_attribution_files": len(repo["licenses"]), "inventory_sha256": inventory.hexdigest(),
    }
    return evidence, {repo["directory"] + "/" + name for name in paths}


def prepare_history(cache: Path, output: Path) -> dict:
    """Populate a fresh directory, or verify every byte of an existing corpus."""
    cache = Path(cache)
    output = Path(output)
    cache.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    lock = json.loads((HERE / "history-lock.json").read_text(encoding="utf-8"))
    verify = output.exists() and any(output.iterdir())
    repos = []
    expected = set()
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        tree = output if verify else Path(tmp) / "history"
        for repo in lock["repositories"]:
            archive = frozen_archive(repo, cache)
            row, files = render_repository(repo, archive, tree, verify)
            expected.update(files)
            repos.append(row)
        if verify:
            actual = {p.relative_to(output).as_posix() for p in output.rglob("*") if p.is_file()}
            if extra := actual - expected:
                raise ValueError(f"unexpected file(s) in history: {sorted(extra)[:10]}")
        else:
            if output.exists():
                output.rmdir()  # Empty directory supplied by the caller.
            tree.rename(output)
    return {
        "measurement": "Physical and nonblank lines of distributed production source, including comments and documentation strings. License and attribution files are counted separately.",
        "repositories": repos,
        "source_files": sum(r["source_files"] for r in repos),
        "physical_lines": sum(r["physical_lines"] for r in repos),
        "nonblank_source_lines": sum(r["nonblank_source_lines"] for r in repos),
    }


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--cache", type=Path, default=WORK / "cache")
    cli.add_argument("--output", type=Path, default=WORK / "public" / "history")
    cli.add_argument("--report", type=Path, help="write the computed inventory outside the public tree")
    args = cli.parse_args()
    report = json.dumps(prepare_history(args.cache, args.output), indent=2)
    print(report)
    if args.report:
        args.report.write_text(report + "\n", encoding="utf-8")
