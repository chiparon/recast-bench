"""Summarize pass rate, reported token usage and elapsed time from a complete batch."""
import argparse
import json
from pathlib import Path


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def duration(ms):
    minutes, seconds = divmod(round(ms / 1000), 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}:{minutes:02}:{seconds:02}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("batch_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    protocol = load(args.batch_dir / "protocol.json")
    assert protocol["repeats"] == 1 and protocol["methods"] == ["recast", "codex"]
    totals = {method: [0, 0, 0, 0, 0] for method in protocol["methods"]}
    text = ["# 五项目配对实测", "", f"同模型 `{protocol['model']}`，推理等级 `{protocol['effort']}`，每个项目每种方法运行一次。", "",
            "耗时以时:分:秒表示。执行耗时从方法启动到返回，端到端耗时还包含私有评分。Token 为供应商返回的输入与输出之和，包含缓存输入。", "",
            "| 项目 | 方法 | 测试通过率 | 已报告 Token | 无用量回执的请求数 | 执行耗时 | 端到端耗时 |",
            "|---|---|---:|---:|---:|---:|---:|"]
    for project in protocol["projects"]:
        for method in protocol["methods"]:
            row = load(args.batch_dir / f"{project}-0-{method}.json")
            assert row["model"] == protocol["model"] and row["effort"] == protocol["effort"]
            assert row["inputHash"] == protocol["inputs"][project]["hash"]
            assert row["controlHash"] == protocol["inputs"][project]["controlHash"]
            assert row["gradingError"] is None and row["budgetStop"] is None
            calls = [json.loads(line) for line in (Path(row["work"]) / "calls.ndjson").read_text(encoding="utf-8").splitlines()]
            tokens = row["usage"]["totalTokens"]
            assert tokens == sum((call.get("usage") or {}).get("totalTokens", 0) for call in calls)
            missing = sum(call.get("usage") is None for call in calls)
            score = row["score"]
            values = [score["passed"] / score["total"], tokens, missing, row["executionMs"], row["wallMs"]]
            totals[method] = [a+b for a,b in zip(totals[method], values)]
            text.append(f'| {project} | {method} | {score["passed"]}/{score["total"]}（{values[0]:.2%}） | {tokens:,} | {missing} | {duration(values[3])} | {duration(values[4])} |')
    for method, (rates, tokens, missing, execution, wall) in totals.items():
        text.append(f'| 五题汇总 | {method} | **{rates/len(protocol["projects"]):.2%}** | **{tokens:,}** | {missing} | {duration(execution)} | {duration(wall)} |')
    text += ["", "汇总行的通过率按项目等权平均，Token 和耗时按项目相加。缺少用量回执时，Token 栏只计入有回执的请求，无法确定精确总量。", ""]
    args.output.write_text("\n".join(text), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
