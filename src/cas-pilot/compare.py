"""Measure submitted Python code in the original holes and pair the 897 case IDs."""
import argparse
import ast
import difflib
import gzip
import subprocess
import io
import json
from pathlib import Path
import tokenize

from grade import ARCHIVE, MODULES, load_cases
from prepare import BASE, SKIP_TOKENS


def functions(tree, prefix=()):
    for child in ast.iter_child_nodes(tree):
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield ".".join((*prefix, child.name)), child
        else:
            yield from functions(child, (*prefix, child.name) if isinstance(child, ast.ClassDef) else prefix)


def code_rows(source, tree):
    excluded = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and ast.get_docstring(node, clean=False) is not None:
            doc = node.body[0]
            excluded.update(range(doc.lineno, doc.end_lineno+1))
        if isinstance(node, ast.Pass) or (isinstance(node, ast.Raise) and "NotImplementedError" in ast.unparse(node)):
            excluded.update(range(node.lineno, node.end_lineno+1))
    return {t.start[0] for t in tokenize.generate_tokens(io.StringIO(source).readline)
            if t.type not in SKIP_TOKENS} - excluded


def measure(starter, candidate, paths):
    rows = {}
    for key in paths:
        old = (starter / key).read_bytes()
        new = (candidate / key).read_bytes()
        if old == new:
            continue
        a,b = (x.decode("utf-8") for x in (old,new))
        before, after = a.splitlines(), b.splitlines()
        diff = difflib.SequenceMatcher(None,before,after,autojunk=False).get_opcodes()
        added = {n for op,_,_,s,e in diff if op!="equal" for n in range(s+1,e+1)}
        row = {"addedPhysical":len(added),"removedPhysical":sum(e-s for op,s,e,_,_ in diff if op!="equal"),
               "addedCode":0,"holeCode":0,"changedFunctions":[]}
        try:
            tree = ast.parse(b)
        except SyntaxError as ex:
            row["syntaxError"]=str(ex)
            rows[key]=row
            continue
        orig = {name for name,fn in functions(ast.parse(a)) if isinstance(fn.body[-1],ast.Raise)
                and ast.unparse(fn.body[-1]) == "raise NotImplementedError('CAS reconstruction TODO')"}
        actual = code_rows(b,tree) & added
        row["addedCode"]=len(actual)
        covered=set()
        for name,fn in functions(tree):
            if name not in orig: continue
            body=fn.body[1:] if ast.get_docstring(fn,clean=False) is not None else fn.body
            if not body: continue
            count=actual.intersection(range(body[0].lineno,body[-1].end_lineno+1))
            if count:
                row["changedFunctions"].append({"name":name,"lines":len(count)})
                covered.update(count)
        row["holeCode"]=len(covered)
        rows[key]=row
    return rows


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch");parser.add_argument("model")
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[2]
    run=root/"results"/"polycodeeval-bench"/args.batch
    starter=BASE/"public"/"target"
    writable=json.loads((starter/"writable.json").read_text(encoding="utf8"))
    cases=load_cases(ARCHIVE, MODULES)
    result={"batch":args.batch,"model":args.model,"retrieval":json.loads((run/"retrieval.json").read_text(encoding="utf8")),"arms":{}}
    archive={}
    if (run/"sag2.json").exists():
        result["sag2"]=json.loads((run/"sag2.json").read_text(encoding="utf8"))
    for arm in ("none","matched"):
        trial=json.loads((run/f"{args.model}-{arm}.json").read_text(encoding="utf8"))
        grades=trial["grades"]
        events=[json.loads(line) for line in (Path(trial["work"])/"events.jsonl").read_text(encoding="utf-8").splitlines()]
        work=Path(trial["work"])
        project=Path((work/"root.txt").read_text(encoding="utf8"))
        baseline=subprocess.check_output(["git","-C",str(project),"rev-list","--max-parents=0","HEAD"],text=True).strip()
        patch=subprocess.check_output(["git","-C",str(project),"diff","--binary",baseline,"--","sympy"],text=True,encoding="utf-8")
        archive[arm]={"baselineTree":trial["starterHash"],"patch":patch,"events":events,
                      "agent":json.loads((work/"agent.json").read_text(encoding="utf8")),"grades":grades}
        if "stages" in trial:
            archive[arm]["familyTests"]={stage["group"]:{suite:json.loads((work/stage["group"]/(suite+".json")).read_text(encoding="utf8"))
                                       for suite in ("before","after","public-before","public","attempt")} for stage in trial["stages"]}
        files=measure(starter,Path(trial["candidate"]),writable)
        groups={}
        for group,modules in cases.items():
            g=grades["private"]["groups"][group]
            ids={f"{m['path']}::{n}" for m in modules for n in m["names"]}
            passed=sorted(ids-set(g.get("failures",{}))) if "error" not in g else []
            assert len(passed)==g["passed"]
            groups[group]={"private":[g["passed"],g["checks"]],"public":grades["public"]["groups"][group]["passed"],
                           "holeCode":sum(f["holeCode"] for k,f in files.items() if k.split("/")[1]==group),
                           "passedCases":passed}
        history=[]
        for i,e in enumerate(events):
            if e.get("scope")=="history" or (e.get("tool")=="read_slice" and e["path"].startswith("history/")):
                history.append({"event":i,**e})
        result["arms"][arm]={**{k:trial[k] for k in ("usage","servedModels","executionSeconds","stop","agentFinal","turns")},
                              "files":files,"groups":groups,"privateScore":grades["private"]["score"],
                              "historyEvents":history,"edits":[{"event":i,**({"group":e["group"]} if "group" in e else {}),"path":e["path"],"sources":e["sources"]} for i,e in enumerate(events) if e["tool"]=="edit_lines"]}
        if "stages" in trial:
            result["arms"][arm]["stages"]=trial["stages"]
    diff={}
    for group in cases:
        a=set(result["arms"]["matched"]["groups"][group]["passedCases"])
        b=set(result["arms"]["none"]["groups"][group]["passedCases"])
        diff[group]={"matchedOnly":sorted(a-b),"noneOnly":sorted(b-a)}
    result["caseDifferences"]=diff
    (root/"results"/f"{args.batch}-evidence.json.gz").write_bytes(gzip.compress(json.dumps(archive).encode(),mtime=0))
    path=root/"results"/f"{args.batch}-comparison.json"
    path.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    for arm,v in result["arms"].items():
        print(arm,"added code",sum(f["addedCode"] for f in v["files"].values()),"hole code",sum(f["holeCode"] for f in v["files"].values()),"private",sum(g["private"][0] for g in v["groups"].values()),"public",sum(g["public"] for g in v["groups"].values()),"history actions",len(v["historyEvents"]))


if __name__=="__main__":
    main()
