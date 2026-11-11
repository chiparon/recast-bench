"""Extract the same pinned, complete public source archives used by Poly L1."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

bench = Path(__file__).resolve().parents[2]
for repo in json.loads((bench / "src/polycodeeval/assets/history.json").read_text()):
    archive = bench / "repro/poly-l1-history" / (repo["name"] + ".zip")
    if hashlib.sha256(archive.read_bytes()).hexdigest() != repo["sha256"]:
        raise ValueError(f"Unexpected archive for {repo['name']}")
    with zipfile.ZipFile(archive) as snapshot:
        snapshot.extractall(Path(sys.argv[1]) / "refs/history" / repo["name"])
