"""Post-trial diagnostics for the single class edited in both CAS submissions."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory


def diagnostics():
    sys.path.insert(0, "/candidate")
    from sympy import AccumBounds as A, S, oo
    probes = {
        "finite endpoints": lambda: (A(-1,2).min, A(-1,2).max) == (-1,2),
        "width and midpoint": lambda: (A(-1,2).delta, A(-1,2).mid) == (3,S.Half),
        "degenerate interval": lambda: A(3,3) == 3,
        "finite addition": lambda: A(-1,2) + A(1,2) == A(0,4),
        "negation": lambda: -A(-1,2) == A(-2,1),
        "scalar subtraction": lambda: A(-1,2) - 3 == A(-4,-1),
        "mixed-sign multiplication": lambda: A(-1,2) * A(-4,3) == A(-8,6),
        "unbounded interval": lambda: (A(-oo,1).min, A(-oo,1).max) == (-oo,1),
        "absolute value": lambda: abs(A(-4,2)) == A(0,4),
        "intersection": lambda: A(-1,2).intersection(A(0,4)) == A(0,2),
        "contained value": lambda: 0 in A(-1,2),
    }
    rows={}
    for label, fn in probes.items():
        try:
            rows[label]={"passed":bool(fn())}
        except Exception as exc:
            rows[label]={"passed":False,"error":f"{type(exc).__name__}: {exc}"}
    print(json.dumps(rows))


if __name__=="__main__":
    if sys.argv[1:] == ["--inside"]:
        diagnostics()
    else:
        from sandbox import container
        from prepare import BASE
        parser=argparse.ArgumentParser(description=__doc__)
        parser.add_argument("batch");parser.add_argument("model")
        args=parser.parse_args()
        dest=BASE.parents[1]/"results"
        trials=dest/"polycodeeval-bench"/args.batch
        image=json.loads((trials/"retrieval.json").read_text())["image"]
        cases={"gold":BASE/"private"/"golden","starter":BASE/"public"/"target"}
        for arm in ("matched","none"):
            cases[arm]=Path(json.loads((trials/f"{args.model}-{arm}.json").read_text())["candidate"])
        outcomes={}
        for name,path in cases.items():
            out=subprocess.check_output(container(image,path,Path(__file__),"--inside"),timeout=90)
            outcomes[name]=json.loads(out)
            print(name,sum(v["passed"] for v in outcomes[name].values()),len(outcomes[name]))
        assert all(v["passed"] for v in outcomes["gold"].values())
        (dest/f"{args.batch}-bounds.json").write_text(json.dumps(outcomes,indent=2)+"\n",encoding="utf-8")
