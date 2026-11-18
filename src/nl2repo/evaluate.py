import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import tomllib
import uuid
from prepare import HERE, ROOT, WORK, tree_manifest, oracle_manifest
from scoring import baseline, score
from upstream import digest, json_write
from docker_transport import docker_command, selected_transport

PLUGINS = {"rich-click": ["inline_snapshot.pytest_plugin", "pytest_snapshot.plugin"],
           "deepdiff": ["pytest_benchmark.plugin"], "jinja": ["pytest_timeout"]}


def native_runtime(project):
    runtime = WORK / "runtime" / (project + "-" + sys.platform)
    python = runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    requirements = HERE / "requirements" / f"{project}.txt"
    stamp = digest(requirements.read_bytes())
    if not python.exists():
        subprocess.run([sys.executable, "-m", "venv", str(runtime)], check=True)
    if not (runtime / "ready.txt").exists() or (runtime / "ready.txt").read_text() != stamp:
        subprocess.run([str(python), "-m", "pip", "install", "-r", str(requirements)], check=True)
        (runtime / "ready.txt").write_text(stamp)
    return python


def runtime(project, backend):
    if backend == "native":
        python = native_runtime(project)
        freeze = subprocess.check_output([str(python), "-m", "pip", "freeze", "--all"], text=True)
        version = subprocess.check_output([str(python), "--version"], text=True).strip()
        return {"backend": backend, "platform": platform.platform(), "python": version,
                "dependencies": freeze, "executable": str(python)}
    context = WORK / "docker" / project
    context.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(HERE / "requirements" / f"{project}.txt", context / "requirements.txt")
    (context / "Dockerfile").write_text(
        "FROM python:3.12.7-slim\nCOPY requirements.txt /tmp/requirements.txt\n"
        "RUN pip install --no-cache-dir -r /tmp/requirements.txt\nENV PYTHONDONTWRITEBYTECODE=1\n",
        encoding="utf-8")
    tag = f"recast-nl2repo-{project}:v1"
    transport = selected_transport()
    build_args = []
    proxy = os.environ.get("RECAST_NL2REPO_BUILD_PROXY")
    if proxy:
        build_args = ["--build-arg", "HTTP_PROXY=" + proxy, "--build-arg", "HTTPS_PROXY=" + proxy]
    subprocess.run(docker_command(transport, "build", "--network", "host", "--platform", "linux/amd64", *build_args, "-t", tag, str(context)), check=True)
    image_id = subprocess.check_output(docker_command(transport, "image", "inspect", "--format", "{{.Id}}", tag), text=True).strip()
    freeze = subprocess.check_output(docker_command(transport, "run", "--rm", "--network", "none", image_id,
                                      "python", "-m", "pip", "freeze", "--all"), text=True)
    return {"backend": backend, "transport": transport, "image": image_id, "dependencies": freeze, "python": "Python 3.12.7", "platform": "linux-amd64"}


def stage(case, candidate, target):
    starter = Path(case["starter"])
    if tree_manifest(starter) != case["input"]:
        raise ValueError("Starter differs from frozen input")
    writable = {m["path"] for m in case["modules"]}
    for name in case["input"]["files"]:
        source = candidate / name if name in writable else starter / name
        if source.is_symlink() or not source.is_file():
            raise ValueError(f"Missing or symlinked input: {name}")
        # Test only immutable packaging/checks, irrespective of unauthorized edits in a delivery.
        output = target / name
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, output)
    original = Path(case["original"])
    if oracle_manifest(original, case["modules"]) != case["oracle"]:
        raise ValueError("Original source or private tests changed after preparation")
    shutil.copytree(original / "tests", target / "tests", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    if (original / "conftest.py").is_file():
        shutil.copyfile(original / "conftest.py", target / "conftest.py")
    config = tomllib.loads((original / "pyproject.toml").read_text(encoding="utf-8")).get("tool", {}).get("pytest", {}).get("ini_options", {})
    text = "[pytest]\n"
    for key, value in config.items():
        if key in {"addopts", "pythonpath", "testpaths"}:
            continue
        text += f"{key} = " + ("\n    " + "\n    ".join(map(str, value)) if isinstance(value, list) else str(value)) + "\n"
    (target / "pytest.ini").write_text(text, encoding="utf-8")
    json_write(target / "plugins.json", PLUGINS.get(case["id"], []))


def evaluate(case, candidate, env_identity, timeout=900):
    project = case["id"]
    parent = WORK / "evaluations"
    parent.mkdir(parents=True, exist_ok=True)
    target = Path(tempfile.mkdtemp(prefix=project + "-", dir=parent))
    stage(case, candidate, target)
    package = case["package"].split("/")[-1]
    backend = env_identity["backend"]
    container = "nl2repo-grade-" + uuid.uuid4().hex
    if backend == "native":
        command = [env_identity["executable"], str(HERE / "worker.py"), str(target), package]
    else:
        command = docker_command(env_identity["transport"], "run", "--rm", "--name", container, "--network", "none", "--cap-drop", "ALL",
                   "--security-opt", "no-new-privileges", "--read-only", "--pids-limit", "256",
                   "--memory", "4g", "--cpus", "4", "--tmpfs", "/tmp:rw,exec,size=1g",
                   "--mount", f"type=bind,source={target},target=/submission",
                   "--mount", f"type=bind,source={HERE},target=/harness,readonly",
                   env_identity["image"], "timeout", "--kill-after=5s", f"{timeout}s",
                   "python", "/harness/worker.py", "/submission", package)
    # No model credentials, user Python paths, or installed answer packages enter the worker.
    safe = {k: v for k, v in os.environ.items() if k.upper() in {
        "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOME"}}
    safe.update(PYTHONDONTWRITEBYTECODE="1", PYTHONNOUSERSITE="1", PYTHONIOENCODING="utf-8")
    start = time.monotonic()
    with (target / "test.log").open("w", encoding="utf-8") as log:
        try:
            done = subprocess.run(command, cwd=target, env=safe, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
            code, error = done.returncode, None
        except subprocess.TimeoutExpired:
            code, error = 124, f"Test timeout after {timeout}s"
        finally:
            if backend == "docker":
                subprocess.run(docker_command(env_identity["transport"], "rm", "-f", container), stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=15)
    report = json.loads((target / "pytest-report.json").read_text(encoding="utf-8")) if (target / "pytest-report.json").exists() else {
        "collected": [], "phases": {}, "collectionErrors": [], "exitCode": code}
    return {"report": report, "exitCode": code, "error": error,
            "wallSeconds": time.monotonic() - start, "evidence": str(target)}


def controls(project, backend, timeout):
    case = json.loads((WORK / "cases" / f"{project}.json").read_text(encoding="utf-8"))
    identity = runtime(project, backend)
    result_dir = ROOT / "results/nl2repo-controls" / backend
    # Original and skeleton receive the same generated packaging, dependencies and test command.
    original = evaluate(case, Path(case["original"]), identity, timeout)
    result = {"project": project, "inputHash": case["input"]["sha256"], "environment": identity,
              "officialTestCount": case["officialTestCount"], "original": original, "status": "baseline-failed"}
    try:
        if original["exitCode"] != 0 or original["error"]:
            raise ValueError(f'Original regression exited {original["exitCode"]}; baseline cannot be frozen')
        frozen = baseline(original["report"])
        empty = evaluate(case, Path(case["starter"]), identity, timeout)
        empty_score = score(frozen["expected"], empty["report"], frozen["excluded"])
        if empty_score["allPassed"]:
            raise ValueError("Empty skeleton passed every test; invalid reconstruction control")
        result.update(status="ready" if backend == "docker" else "native-validation-only",
                      baseline=frozen, skeleton=empty,
                      originalScore=score(frozen["expected"], original["report"], frozen["excluded"]),
                      skeletonScore=empty_score)
    except ValueError as error:
        result["error"] = str(error)
    json_write(result_dir / f"{project}.json", result)
    print(project, result["status"], result.get("originalScore"), result.get("skeletonScore"), result.get("error", ""), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", choices=["sqlparse", "rich-click", "deepdiff", "boltons", "jinja"])
    parser.add_argument("--backend", choices=["native", "docker"], default="docker")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.candidate:
        if not args.project or not args.output:
            parser.error("--candidate requires --project and --output")
        control = json.loads((ROOT / "results/nl2repo-controls" / args.backend / f"{args.project}.json").read_text(encoding="utf-8"))
        if control["status"] != "ready":
            raise ValueError("Formal scoring requires passing isolated Docker controls")
        case = json.loads((WORK / "cases" / f"{args.project}.json").read_text(encoding="utf-8"))
        if control["inputHash"] != case["input"]["sha256"]:
            raise ValueError("Control/input mismatch")
        result = evaluate(case, args.candidate.resolve(), control["environment"], args.timeout)
        result["score"] = score(control["baseline"]["expected"], result["report"], control["baseline"]["excluded"])
        json_write(args.output, result)
    else:
        results = [controls(p, args.backend, args.timeout) for p in ([args.project] if args.project else
                    ["sqlparse", "rich-click", "deepdiff", "boltons", "jinja"])]
        if any(r["status"] == "baseline-failed" for r in results):
            sys.exit(1)


if __name__ == "__main__":
    main()
