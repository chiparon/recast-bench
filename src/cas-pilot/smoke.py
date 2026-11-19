"""Public examples. Run python smoke.py PATH_TO_CANDIDATE."""
import argparse
import json
import sys
from pathlib import Path


def polys(s, x):
    return s.factor(x**3 - x) == x * (x - 1) * (x + 1)


def matrices(s, x):
    matrix = s.Matrix([[x, 1], [1, x]])
    return matrix.det() == x**2 - 1


def functions(s, x):
    return s.sin(s.pi / 6) == s.Rational(1, 2) and s.factorial(6) == 720


def integrals(s, x):
    return s.integrate(x**2, (x, 0, 3)) == 9


def solvers(s, x):
    return set(s.solve(x**2 + x - 2, x)) == {-2, 1}


def simplify(s, x):
    return s.trigsimp(s.sin(x)**2 + s.cos(x)**2) == 1


def series(s, x):
    return s.exp(x).series(x, 0, 4).removeO() == 1 + x + x**2/2 + x**3/6


def concrete(s, x):
    return s.summation(x**2, (x, 1, 6)) == 91


def ntheory(s, x):
    return s.factorint(252) == {2: 2, 3: 2, 7: 1}


def combinatorics(s, x):
    from sympy.combinatorics.named_groups import SymmetricGroup
    return SymmetricGroup(4).order() == 24


def tensor(s, x):
    return s.tensorproduct(s.Array([2, 3]), s.Array([5, 7])).tolist() == [[10, 14], [15, 21]]


def geometry(s, x):
    return s.Line(s.Point(0, 0), s.Point(1, 1)).intersection(
        s.Line(s.Point(0, 2), s.Point(2, 0))) == [s.Point(1, 1)]


def sets(s, x):
    return s.Interval(0, 3).intersect(s.Interval.open(1, 4)) == s.Interval.Lopen(1, 3)


def calculus(s, x):
    return s.finite_diff_weights(1, [-1, 0, 1], 0)[1][-1] == [-s.S.Half, 0, s.S.Half]


def printing(s, x):
    return s.latex(s.sqrt(x)) == r"\sqrt{x}"


CHECKS = {fn.__name__: fn for fn in (polys, matrices, functions, integrals, solvers,
          simplify, series, concrete, ntheory, combinatorics, tensor, geometry, sets,
          calculus, printing)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--group", choices=CHECKS, action="append")
    args = parser.parse_args()
    root = args.root.resolve()
    package = root / "sympy" / "__init__.py"
    if not package.is_file():
        parser.error(f"missing {package}")
    sys.path.insert(0, str(root))
    groups = {}
    for name in args.group or CHECKS:
        try:
            import sympy
            if Path(sympy.__file__).resolve() != package:
                raise ImportError(f"unexpected SymPy path {sympy.__file__}")
            passed = bool(CHECKS[name](sympy, sympy.Symbol("x")))
            message = "" if passed else "unexpected result"
        except Exception as exc:
            passed, message = False, f"{type(exc).__name__}: {exc}"
        groups[name] = {"checks": 1, "passed": int(passed), "failed": int(not passed)}
        if message:
            groups[name]["error"] = message
    score = sum(g["passed"] for g in groups.values()) / len(groups)
    print(json.dumps({"suite": "public", "score": score, "groups": groups}))
    return int(score < 1)


if __name__ == "__main__":
    raise SystemExit(main())
