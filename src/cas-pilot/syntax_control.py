"""Isolate syntax regressions using earlier commits of the same trial, without generation."""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from prepare import BASE, HERE


def diagnose(batch, model, arm):
    results = HERE.parents[1] / "results"
    run = json.loads((results / "polycodeeval-bench" / batch / f"{model}-{arm}.json").read_text(encoding="utf8"))
    submission = Path(run["candidate"])
    repository = Path((Path(run["work"]) / "root.txt").read_text(encoding="utf8"))
    files = json.loads((submission / "writable.json").read_text(encoding="utf8"))
    repairs = {}
    with tempfile.TemporaryDirectory(dir=BASE/"private") as stage:
        root = Path(stage) / "target"
        shutil.copytree(submission, root)
        for key in files:
            try:
                ast.parse((root/key).read_bytes())
            except SyntaxError as exc:
                revisions = subprocess.check_output(["git","-C",str(repository),"log","--format=%H","--",key],text=True).split()
                for revision in revisions:
                    old = subprocess.check_output(["git","-C",str(repository),"show",f"{revision}:{key}"])
                    try:
                        ast.parse(old)
                    except SyntaxError:
                        continue
                    (root/key).write_bytes(old)
                    repairs[key]={"error":str(exc),"fromCommit":revision,"restoredSHA256":hashlib.sha256(old).hexdigest()}
                    break
                else:
                    raise ValueError(f"No parseable version of {key}")
        scores={}
        if repairs:
            for suite in ("public","private"):
                outfile=Path(stage)/(suite+".json")
                proc=subprocess.run([sys.executable,"-B",str(HERE/"task.py"),"grade",str(root),"--suite",suite,"--json",str(outfile)],
                                    stdout=subprocess.DEVNULL,env={**os.environ,"CAS_PILOT_IMAGE":run["image"]})
                assert proc.returncode in (0,1) and outfile.exists()
                scores[suite]=json.loads(outfile.read_text(encoding="utf8"))
        else:
            scores=run["grades"]
    data={"batch":batch,"arm":arm,"repairs":repairs,"diagnosticOnly":True,"groups":{}, "totals":{}}
    for suite,grade in scores.items():
        data["groups"][suite]={name:[row["passed"],row["checks"]] for name,row in grade["groups"].items()}
        data["totals"][suite]=sum(x[0] for x in data["groups"][suite].values())
    (results/f"{batch}-{arm}-syntax-control.json").write_text(json.dumps(data,indent=2)+"\n",encoding="utf8")
    print(arm,repairs.keys(),data["totals"])


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for name in ("batch","model","arm"):p.add_argument(name)
    diagnose(**vars(p.parse_args()))
