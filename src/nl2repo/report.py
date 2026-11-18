import argparse
import json
from pathlib import Path
from prepare import ROOT, WORK
from scoring import macro_average, passed
from upstream import json_write


def build_report(batch=None):
    projects = ["sqlparse", "rich-click", "deepdiff", "boltons", "jinja"]
    text = ["# NL2Repo skeleton reconstruction benchmark", "",
            "This is a declaration-skeleton variant of NL2Repo, not the original empty-workspace benchmark.", ""]
    records = []
    text += ["| Project | Production files | Original lines | Upstream count | Local baseline | Skeleton | Environment |",
             "|---|---:|---:|---:|---|---|---|"]
    for project in projects:
        case = json.loads((WORK / "cases" / f"{project}.json").read_text(encoding="utf-8"))
        row = {"project": project, "sourceLines": case["sourceLines"], "files": len(case["modules"]),
               "officialTestCount": case["officialTestCount"], "inputHash": case["input"]["sha256"]}
        control = None
        for backend in ("docker", "native"):
            path = ROOT / "results/nl2repo-controls" / backend / f"{project}.json"
            if path.exists():
                control = json.loads(path.read_text(encoding="utf-8"))
                break
        original_score, skeleton_score, state = "pending", "pending", "pending"
        if control:
            report = control["original"]["report"]
            n = sum(passed(phases) for phases in report["phases"].values())
            row.update(status=control["status"], backend=control["environment"]["backend"],
                       collected=len(report["collected"]), baselinePassed=n,
                       baselineError=control.get("error"), originalScore=control.get("originalScore"),
                       skeletonScore=control.get("skeletonScore"))
            original_score = f'{n}/{len(report["collected"])} collected'
            if control.get("skeletonScore"):
                s = control["skeletonScore"]
                skeleton_score = f'{s["passed"]}/{s["total"]}'
            state = control["status"]
        text.append(f'| {project} | {row["files"]} | {row["sourceLines"]:,} | {row["officialTestCount"]} | {original_score} | {skeleton_score} | {state} |')
        records.append(row)
    text += ["", "Native controls are preparation diagnostics. Formal model scores require successful isolated controls, including a frozen list of eligible test IDs. Skips and expected failures in the original are excluded before either arm runs. Collection failures and missing tests in a generated submission remain in the fixed denominator.", ""]
    result = {"kind": "input-and-control-readiness", "projects": records}
    destination = ROOT / "results/nl2repo-readiness"
    if batch:
        folder = ROOT / "results/nl2repo" / batch
        protocol = json.loads((folder / "protocol.json").read_text(encoding="utf-8"))
        rows = []
        for project in protocol["projects"]:
            for repetition in range(protocol["repeats"]):
                for method in protocol["methods"]:
                    file = folder / f"{project}-{repetition}-{method}.json"
                    row = json.loads(file.read_text(encoding="utf-8")) if file.exists() else {
                        "project": project, "method": method, "repetition": repetition, "score": None, "pending": True}
                    if not row.get("pending"):
                        if row["inputHash"] != protocol["inputs"][project]["hash"] or row["controlHash"] != protocol["inputs"][project]["controlHash"]:
                            raise ValueError("Trial identity differs from batch protocol")
                        if row["model"] != protocol["model"]:
                            raise ValueError("Trial model differs from batch protocol")
                    rows.append(row)
        complete = all(r.get("score") is not None for r in rows)
        text += ["## Paired model results", "", "| Project | Repetition | Method | Test pass rate | Tokens | State |",
                 "|---|---:|---|---:|---:|---|"]
        for r in rows:
            s = r.get("score")
            rate = f'{s["passed"]}/{s["total"]} ({s["rate"]:.2%})' if s else "pending / infrastructure error"
            text.append(f'| {r["project"]} | {r["repetition"]} | {r["method"]} | {rate} | {r.get("usage", {}).get("totalTokens", "—")} | {r.get("error") or r.get("gradingError") or ("pending" if not s else "graded")} |')
        averages = {}
        if complete:
            for method in protocol["methods"]:
                project_means = [{"rate": macro_average([r["score"] for r in rows if r["project"] == p and r["method"] == method])}
                                 for p in protocol["projects"]]
                averages[method] = macro_average(project_means)
            text += ["", "Macro average: " + ", ".join(f"{m}={v:.2%}" for m, v in averages.items())]
        else:
            text += ["", "Batch incomplete: no aggregate comparison is reported."]
        result.update(kind="paired-model-comparison", batch=batch, complete=complete, macroAverage=averages, trials=rows)
        destination = ROOT / "results" / ("nl2repo-" + batch)
    json_write(destination.with_suffix(".json"), result)
    destination.with_suffix(".md").write_text("\n".join(text) + "\n", encoding="utf-8")
    print(destination.with_suffix(".md"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch")
    args = parser.parse_args()
    if args.batch and (not all(c.isalnum() or c in "_-" for c in args.batch)):
        parser.error("Invalid batch name")
    build_report(args.batch)
