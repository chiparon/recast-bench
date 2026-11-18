import argparse
import json
import gzip
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
        text += ["## Per-trial details", "", "| Project | Repetition | Method | Test pass rate | Reported tokens | State |",
                 "|---|---:|---|---:|---:|---|"]
        for r in rows:
            s = r.get("score")
            rate = f'{s["passed"]}/{s["total"]} ({s["rate"]:.2%})' if s else "pending / infrastructure error"
            state = r.get("budgetStop") or r.get("gradingError") or r.get("error") or ("pending" if not s else "graded")
            state = str(state).replace("|", "\\|").replace("\n", " ")
            text.append(f'| {r["project"]} | {r["repetition"]} | {r["method"]} | {rate} | {r.get("usage", {}).get("totalTokens", "—")} | {state} |')
        averages = {}
        if complete:
            for method in protocol["methods"]:
                project_means = [{"rate": macro_average([r["score"] for r in rows if r["project"] == p and r["method"] == method])}
                                 for p in protocol["projects"]]
                averages[method] = macro_average(project_means)
            text += ["", "Macro average: " + ", ".join(f"{m}={v:.2%}" for m, v in averages.items())]
            overview = ["# NL2Repo paired results: " + batch, "",
                f'Model: **{protocol["model"]}**, effort `{protocol["effort"]}`. Each method receives the same input and a **{protocol["tokens"]:,} reported-token stop threshold / {protocol["seconds"]:,} second execution budget** per project. Repetitions per method: {protocol["repeats"]}.', "",
                "| Project | RECAST test pass rate | Codex test pass rate |", "|---|---:|---:|"]
            for p in protocol["projects"]:
                cells = []
                for m in protocol["methods"]:
                    scores = [r["score"] for r in rows if r["project"] == p and r["method"] == m]
                    mean = macro_average(scores)
                    cells.append(f'{scores[0]["passed"]}/{scores[0]["total"]} ({mean:.2%})' if len(scores) == 1 else f"{mean:.2%}")
                overview.append(f'| {p} | ' + " | ".join(cells) + " |")
            overview.append("| Equal-project average | " + " | ".join(f"**{averages[m]:.2%}**" for m in protocol["methods"]) + " |")
            budget_stops = sum(bool(r.get("budgetStop")) for r in rows)
            full = {m: sum(r["score"]["allPassed"] for r in rows if r["method"] == m) for m in protocol["methods"]}
            overview += ["", f'{budget_stops}/{len(rows)} trials stopped at the configured budget. Fully passing deliveries: ' + ", ".join(f"{m}={v}/{len(protocol['projects']) * protocol['repeats']}" for m, v in full.items()) + ".",
                "", "The threshold is checked after a provider response, so the final request can exceed it. Actual reported usage appears below; all usage records in this batch retain their completeness flag. Original harness cancellation messages are preserved in JSON, while the displayed stop reason comes from the benchmark budget controller.",
                "", "These are one-budget, limited-sample results for the declaration-skeleton setup, with an empty reference corpus and per-file RECAST scheduling without supplied dependency edges. Most runs retain import/collection failures. They do not establish a general model or harness ranking.",
                "", "## Inputs and controls", ""]
            text = overview + text[2:]
        else:
            text += ["", "Batch incomplete: no aggregate comparison is reported."]
        result.update(kind="paired-model-comparison", batch=batch, protocol=protocol, complete=complete, macroAverage=averages, trials=rows)
        destination = ROOT / "results" / ("nl2repo-" + batch)
        if complete:
            evidence = {"protocol": protocol, "controls": {}, "trials": rows, "deliveries": {}, "calls": {}}
            for p in protocol["projects"]:
                evidence["controls"][p] = json.loads((ROOT / "results/nl2repo-controls/docker" / f"{p}.json").read_text(encoding="utf-8"))
            for r in rows:
                key = f'{r["project"]}-{r["repetition"]}-{r["method"]}'
                case = json.loads((WORK / "cases" / f'{r["project"]}.json').read_text(encoding="utf-8"))
                if r.get("outputRoot"):
                    evidence["deliveries"][key] = {m["path"]: (Path(r["outputRoot"]) / m["path"]).read_text(encoding="utf-8") for m in case["modules"]}
                calls = Path(r["work"]) / "calls.ndjson"
                evidence["calls"][key] = [json.loads(line) for line in calls.read_text(encoding="utf-8").splitlines()] if calls.exists() else []
            evidence_path = destination.with_name(destination.name + "-evidence.json.gz")
            with gzip.open(evidence_path, "wt", encoding="utf-8") as archive:
                json.dump(evidence, archive, ensure_ascii=False)
            text += ["", f"[Reproducible evidence: protocol, controls, per-trial usage and delivered files]({evidence_path.name})"]
    json_write(destination.with_suffix(".json"), result)
    destination.with_suffix(".md").write_text("\n".join(text).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(destination.with_suffix(".md"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch")
    args = parser.parse_args()
    if args.batch and (not all(c.isalnum() or c in "_-" for c in args.batch)):
        parser.error("Invalid batch name")
    build_report(args.batch)
