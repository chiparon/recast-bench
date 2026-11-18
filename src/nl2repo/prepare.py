import argparse
import ast
import json
from pathlib import Path
import re
import shutil
import subprocess
import tomllib
import zipfile
from skeleton import skeleton
from upstream import Registry, digest, extract_prefix, json_write

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
WORK = ROOT / "work/nl2repo"


def tree_manifest(root):
    files = {p.relative_to(root).as_posix(): digest(p.read_bytes())
             for p in sorted(root.rglob("*")) if p.is_file() and ".git" not in p.parts}
    return {"sha256": digest(json.dumps(files, sort_keys=True).encode()), "files": files}


def oracle_manifest(original, modules):
    names = {m["path"] for m in modules} | {"pyproject.toml"}
    names.update(p.relative_to(original).as_posix() for p in (original / "tests").rglob("*")
                 if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc")
    if (original / "conftest.py").is_file():
        names.add("conftest.py")
    return {name: digest((original / name).read_bytes()) for name in sorted(names)}


def fetch_upstream(lock):
    path = WORK / "upstream"
    if not path.exists():
        subprocess.run(["git", "clone", lock["repository"], str(path)], check=True)
    actual = subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()
    if actual != lock["commit"]:
        subprocess.run(["git", "-C", str(path), "fetch", "origin", lock["commit"]], check=True)
        subprocess.run(["git", "-C", str(path), "checkout", "--detach", lock["commit"]], check=True)
    return path


def prepare(project, spec, upstream):
    original = WORK / "private" / project / "original"
    if not original.exists():
        registry = Registry(project)
        archive = registry.blob(spec["source_blob"], WORK / "blobs")
        extract_prefix(archive, spec["source_prefix"], original)
    public = WORK / "inputs" / project
    if public.exists():
        # Existing input is immutable. Detect drift instead of overwriting work.
        old = json.loads((WORK / "cases" / f"{project}.json").read_text(encoding="utf-8"))
        if tree_manifest(public) != old["input"]:
            raise ValueError(f"Prepared input changed: {public}")
        return old
    public.mkdir(parents=True)
    modules = []
    assets = []
    source_lines = 0
    stub_lines = 0
    for path in sorted((original / spec["package"]).rglob("*.py")):
        relative = path.relative_to(original).as_posix()
        source = path.read_text(encoding="utf-8-sig")
        stub = skeleton(source)
        output = public / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(stub, encoding="utf-8", newline="\n")
        doc = ast.get_docstring(ast.parse(source)) or "Implement the APIs in " + relative
        modules.append({"name": relative.removesuffix(".py").replace("/", "."),
                        "path": relative, "language": "Python", "description": doc.split("\n\n")[0][:100]})
        source_lines += len(source.splitlines())
        stub_lines += len(stub.splitlines())
    for path in sorted((original / spec["package"]).rglob("*")):
        if path.is_file() and (path.suffix == ".pyi" or path.name == "py.typed"):
            relative = path.relative_to(original).as_posix()
            (public / relative).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, public / relative)
            assets.append(relative)
    metadata = tomllib.loads((original / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    # Static packaging cannot import a placeholder __version__, nor install an answer library.
    pyproject = '[build-system]\nrequires = ["setuptools==80.9.0", "wheel==0.45.1"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\n'
    pyproject += f'name = {json.dumps(metadata["name"])}\nversion = {json.dumps(metadata["version"])}\n'
    pyproject += 'description = "NL2Repo declaration-skeleton reconstruction"\nrequires-python = ">=3.12"\n'
    dependencies = metadata.get("dependencies", [])
    normalized = lambda s: re.split(r"[<>=!~;\[ ]", s.lower().replace("_", "-"))[0]
    dependencies = [d for d in dependencies if normalized(d) != normalized(metadata["name"])]
    pyproject += "dependencies = " + json.dumps(dependencies) + "\n"
    if metadata.get("scripts"):
        pyproject += "\n[project.scripts]\n" + "".join(f'{json.dumps(k)} = {json.dumps(v)}\n' for k, v in metadata["scripts"].items())
    package_dir = "src" if spec["package"].startswith("src/") else "."
    package = spec["package"].split("/")[-1]
    pyproject += f'\n[tool.setuptools.packages.find]\nwhere = ["{package_dir}"]\ninclude = ["{package}*"]\n'
    (public / "pyproject.toml").write_text(pyproject, encoding="utf-8", newline="\n")
    for name in ("LICENSE", "LICENSE.txt", "LICENSE.rst", "COPYING"):
        if (original / name).is_file():
            shutil.copyfile(original / name, public / name)
    requirement = (upstream / "test_files" / project / "start.md").read_text(encoding="utf-8")
    removed = 0
    if project == "deepdiff":
        requirement, removed = re.subn(r"deepdiff==8\.5\.0\s*\(core library\),\s*", "", requirement)
        if removed != 1:
            raise ValueError("Expected exactly one known DeepDiff self-dependency instruction")
    # The shared file tools cap individual reads at 256k characters. Small ordered
    # parts also let both methods read only the relevant API sections per module.
    parts, current = [], ""
    for line in requirement.splitlines(keepends=True):
        if len(current) + len(line) > 24000 and current:
            parts.append(current)
            current = ""
        current += line
    if current:
        parts.append(current)
    index = "# Common NL2Repo requirements\n\nThe complete sanitized upstream specification is split in order below. Read the introduction and the sections relevant to the module you are implementing. Every part is available to both methods.\n\n"
    for number, content in enumerate(parts, 1):
        name = f"requirements/part-{number:02}.md"
        (public / name).parent.mkdir(parents=True, exist_ok=True)
        (public / name).write_text(content, encoding="utf-8", newline="\n")
        index += f"- [{name}]({name})\n"
    assert "".join(parts) == requirement
    (public / "REQUIREMENTS.md").write_text(index, encoding="utf-8", newline="\n")
    task = f"Reconstruct the {project} Python package. Read REQUIREMENTS.md for the complete common specification. "
    task += "Implement all supplied production files, including imports, inheritance, decorators, constants and function bodies. "
    task += "The supplied files contain declarations only. Packaging is fixed. Only the listed Python production files are writable. "
    task += "Both methods receive this exact input, the same public checks, and an empty external reference corpus. "
    task += "Do not download, install or retrieve the target package or its original implementation. "
    task += "Public checks are illustrative; evaluation uses withheld upstream tests with a fixed baseline denominator. "
    task += "Module descriptions are documentation, not additional authorization.\n"
    (public / "TASK.md").write_text(task, encoding="utf-8", newline="\n")
    shutil.copyfile(HERE / "public_check.py", public / "public_check.py")
    shutil.copyfile(HERE / "requirements" / f"{project}.txt", public / "environment.txt")
    json_write(public / "modules.json", modules)
    if len(task + "\n\nPublic module manifest:\n" + json.dumps(modules, separators=(",", ":"))) > 8000:
        raise ValueError("Module manifest exceeds ProjectPipeline's requirement limit")
    record = {"id": project, "package": spec["package"], "distribution": metadata["name"],
              "sourceImage": spec["image"], "officialTestCount": spec["count"],
              "original": str(original), "starter": str(public), "modules": modules, "typeAssets": assets,
              "sourceLines": source_lines, "skeletonLines": stub_lines,
              "oracle": oracle_manifest(original, modules),
              "selfDependencyCorrections": removed, "input": tree_manifest(public),
              "referencePolicy": "empty-for-both-arms", "skeletonPolicy": "declarations-only-v1"}
    json_write(WORK / "cases" / f"{project}.json", record)
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", choices=["sqlparse", "rich-click", "deepdiff", "boltons", "jinja"])
    args = parser.parse_args()
    lock = json.loads((HERE / "upstream-lock.json").read_text(encoding="utf-8"))
    upstream = fetch_upstream(lock["nl2repo"])
    records = [prepare(p, s, upstream) for p, s in lock["projects"].items() if not args.project or p == args.project]
    for row in records:
        print(row["id"], len(row["modules"]), row["sourceLines"], row["input"]["sha256"])
    if not args.project:
        archive = ROOT / "repro/nl2repo-v1-inputs.zip"
        archive.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
            for row in records:
                for name in row["input"]["files"]:
                    zipped.write(Path(row["starter"]) / name, f'{row["id"]}/{name}')
        json_write(ROOT / "results/nl2repo-inputs.json", [
            {k: v for k, v in row.items() if k not in {"starter", "original", "modules", "oracle"}} for row in records])


if __name__ == "__main__":
    main()
