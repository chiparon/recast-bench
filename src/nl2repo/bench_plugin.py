"""Machine-readable pytest phases; a failed collection never reduces the denominator."""
import json
import os
from pathlib import Path

collected = []
phases = {}
collection_errors = []


def pytest_collection_modifyitems(items):
    collected.extend(item.nodeid for item in items)


def pytest_collectreport(report):
    if report.failed:
        collection_errors.append({"nodeid": report.nodeid, "error": str(report.longrepr)[:6000]})


def pytest_runtest_logreport(report):
    phases.setdefault(report.nodeid, []).append({
        "when": report.when, "outcome": report.outcome,
        "wasxfail": getattr(report, "wasxfail", None),
        "error": str(report.longrepr)[:3000] if report.failed else None,
    })


def pytest_sessionfinish(session, exitstatus):
    Path(os.environ["NL2REPO_REPORT"]).write_text(json.dumps({
        "collected": collected, "phases": phases, "collectionErrors": collection_errors,
        "exitCode": int(exitstatus),
    }, indent=2), encoding="utf-8")
