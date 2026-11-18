"""Fetch the published NL2Repo source snapshots without requiring Docker Desktop."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import tarfile
import urllib.request

REGISTRY = "https://ghcr.io"
NAMESPACE = "multimodal-art-projection/nl2repobench"
PROJECTS = {
    "sqlparse": {"source_layer": 12, "source_prefix": "sqlparse", "package": "sqlparse", "count": 461},
    "rich-click": {"source_layer": 9, "source_prefix": "project", "package": "src/rich_click", "count": 145},
    "deepdiff": {"source_layer": 12, "source_prefix": "deepdiff", "package": "deepdiff", "count": 970},
    "boltons": {"source_layer": 13, "source_prefix": "boltons", "package": "boltons", "count": 423},
    "jinja": {"source_layer": 8, "source_prefix": "jinja", "package": "src/jinja2", "count": 911},
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


class Registry:
    def __init__(self, project):
        self.repo = f"{NAMESPACE}/{project}"
        url = f"{REGISTRY}/token?scope=repository:{self.repo}:pull"
        with urllib.request.urlopen(url, timeout=60) as response:
            self.token = json.load(response)["token"]

    def get(self, kind, name):
        request = urllib.request.Request(
            f"{REGISTRY}/v2/{self.repo}/{kind}/{name}",
            headers={"Authorization": f"Bearer {self.token}",
                     "Accept": "application/vnd.docker.distribution.manifest.v2+json"},
        )
        return urllib.request.urlopen(request, timeout=120)

    def metadata(self, pin="1.0"):
        with self.get("manifests", pin) as response:
            raw = response.read()
        manifest = json.loads(raw)
        with self.get("blobs", manifest["config"]["digest"]) as response:
            config = json.load(response)
        return "sha256:" + digest(raw), manifest, config

    def blob(self, layer, cache):
        cache.mkdir(parents=True, exist_ok=True)
        target = cache / (layer["digest"].split(":")[1] + ".tar.gz")
        if not target.exists():
            temporary = target.with_suffix(".partial")
            with self.get("blobs", layer["digest"]) as response, temporary.open("wb") as out:
                while chunk := response.read(1024 * 1024):
                    out.write(chunk)
            temporary.replace(target)
        if digest(target.read_bytes()) != layer["digest"].split(":")[1]:
            raise ValueError(f"Registry layer digest mismatch: {target}")
        return target


def extract_prefix(archive, prefix, target):
    """Extract regular files only; upstream Git history and bytecode stay private/unused."""
    target.mkdir(parents=True, exist_ok=True)
    count = 0
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar:
            parts = PurePosixPath(member.name).parts
            if not parts or parts[0] != prefix or len(parts) < 2:
                continue
            relative = PurePosixPath(*parts[1:])
            if ".." in relative.parts or relative.is_absolute():
                raise ValueError(f"Unsafe archive path: {member.name}")
            if any(p in {".git", "__pycache__", ".pytest_cache"} for p in relative.parts):
                continue
            if member.isfile() and not member.name.endswith((".pyc", ".pyo")):
                dest = target.joinpath(*relative.parts)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(tar.extractfile(member).read())
                count += 1
    if not count:
        raise ValueError(f"No files below {prefix!r} in {archive}")
    return count
