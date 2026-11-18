def passed(phases):
    return (any(p["when"] == "call" and p["outcome"] == "passed" and not p.get("wasxfail") for p in phases)
            and all(p["outcome"] == "passed" for p in phases)
            and {p["when"] for p in phases} >= {"setup", "call", "teardown"})


def baseline(report):
    if report.get("collectionErrors") or report.get("exitCode") not in (0, 1):
        raise ValueError("Original project has collection/runtime errors; baseline cannot be frozen")
    ids = report["collected"]
    if not ids or len(set(ids)) != len(ids):
        raise ValueError("Original test IDs must be nonempty and unique")
    bad = [i for i in ids if not report["phases"].get(i) or any(p["outcome"] == "failed" for p in report["phases"][i])]
    if bad:
        raise ValueError(f"Original project failed {len(bad)} tests: {bad[:5]}")
    expected = [i for i in ids if passed(report["phases"].get(i, []))]
    if not expected:
        raise ValueError("No passing baseline tests")
    return {"expected": expected, "excluded": [i for i in ids if i not in expected], "collected": len(ids)}


def score(expected, report, excluded=()):
    if not expected or len(set(expected)) != len(expected):
        raise ValueError("Expected test IDs must be nonempty and unique")
    phases = report.get("phases", {})
    successes = [i for i in expected if passed(phases.get(i, []))]
    return {"passed": len(successes), "total": len(expected), "rate": len(successes) / len(expected),
            "missing": sum(i not in phases for i in expected),
            "collectionErrors": len(report.get("collectionErrors", [])),
            "unexpected": len(set(report.get("collected", [])) - set(expected) - set(excluded)),
            "allPassed": len(successes) == len(expected) and not report.get("collectionErrors")}


def macro_average(rows):
    return sum(r["rate"] for r in rows) / len(rows) if rows else None
