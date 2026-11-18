"""Public behavior checks run without network, private tests or original source."""
import argparse
from pathlib import Path
import subprocess
import uuid
from docker_transport import docker_command

parser = argparse.ArgumentParser()
parser.add_argument("project")
parser.add_argument("image")
parser.add_argument("transport", nargs="?", default="desktop")
args = parser.parse_args()
name = "nl2repo-public-" + uuid.uuid4().hex
try:
    result = subprocess.run(docker_command(
        args.transport, "run", "--rm", "--name", name, "--network", "none", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--read-only", "--pids-limit", "128",
        "--memory", "2g", "--cpus", "2", "--tmpfs", "/tmp:rw,exec,size=512m",
        "--mount", f"type=bind,source={Path.cwd()},target=/input,readonly",
        "--mount", f"type=bind,source={Path(__file__).with_name('public_worker.py')},target=/public_worker.py,readonly",
        args.image, "timeout", "--kill-after=5s", "90s", "python", "/public_worker.py", args.project,
    ), timeout=110)
    raise SystemExit(result.returncode)
finally:
    subprocess.run(docker_command(args.transport, "rm", "-f", name), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
