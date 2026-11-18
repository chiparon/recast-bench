"""Runs inside a clean dependency runtime; no original implementation is installed."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import shutil

destination = Path(sys.argv[1]).resolve()
root = destination
if os.name != "nt":
    # Build and test on the container's Linux filesystem. Windows bind mounts
    # cannot perform every chmod that setuptools uses when copying a wheel.
    root = Path("/tmp/project")
    shutil.copytree(destination, root, copy_function=shutil.copyfile)
package = sys.argv[2]
os.chdir(root)
installed = root / ".installed"
env = dict(os.environ, PIP_NO_INDEX="1", PIP_DISABLE_PIP_VERSION_CHECK="1", PYTHONDONTWRITEBYTECODE="1")
build = subprocess.run([sys.executable, "-m", "pip", "install", "--no-deps", "--no-build-isolation",
                        "--no-compile", "--target", str(installed), str(root)], env=env,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
(destination / "install.log").write_text(build.stdout, encoding="utf-8")
if build.returncode:
    print(build.stdout)
    sys.exit(build.returncode)
sys.path[:0] = [str(root / "src"), str(root), str(installed)]
spec = importlib.util.find_spec(package)
if spec is None or not spec.origin or not Path(spec.origin).resolve().is_relative_to(root):
    raise RuntimeError(f"Target import must resolve to the submitted tree: {package}: {spec}")
env["PYTHONPATH"] = os.pathsep.join([str(root / "src"), str(root), str(installed), str(Path(__file__).parent)])
env["PATH"] = os.pathsep.join([str(installed / "bin"), str(installed / "Scripts"), str(Path(sys.executable).parent), env.get("PATH", "")])
env["NL2REPO_REPORT"] = str(destination / "pytest-report.json")
env["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"
command = [sys.executable, "-m", "pytest", "-p", "bench_plugin", "--continue-on-collection-errors",
           "-o", "addopts=", "-o", "cache_dir=/tmp/nl2repo-pytest-cache" if os.name != "nt" else "cache_dir=.pytest_cache",
           "-q", "tests"]
for plugin in json.loads((root / "plugins.json").read_text()):
    command[3:3] = ["-p", plugin]
result = subprocess.run(command, env=env)
sys.exit(result.returncode)
