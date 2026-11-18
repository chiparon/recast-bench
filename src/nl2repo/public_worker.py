import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

source, target = Path("/input"), Path("/tmp/project")
modules = json.loads((source / "modules.json").read_text())
for name in ["pyproject.toml", "public_check.py", *(m["path"] for m in modules)]:
    path = target / name
    path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / name, path)
os.chdir(target)
env = dict(os.environ, PIP_NO_INDEX="1", PIP_DISABLE_PIP_VERSION_CHECK="1", PYTHONPATH="/tmp/installed")
subprocess.run([sys.executable, "-m", "pip", "install", "--no-deps", "--no-build-isolation", "--no-compile",
                "--target", "/tmp/installed", "."], env=env, check=True, stdout=subprocess.DEVNULL)
raise SystemExit(subprocess.run([sys.executable, "public_check.py", sys.argv[1]], env=env).returncode)
