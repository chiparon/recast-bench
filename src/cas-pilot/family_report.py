"""Summarize the cumulative family trials and the source-use evidence."""
import argparse
from collections import Counter
import json
import re
from pathlib import Path


def report(batch):
    root = Path(__file__).resolve().parents[2]
    path = root / "results"
    data = json.loads((path / f"{batch}-comparison.json").read_text(encoding="utf8"))
    previous = json.loads((path / "cas-pair-v2-comparison.json").read_text(encoding="utf8"))
    def totals(arm):
        files = arm["files"].values()
        return [len(arm.get("stages", [])), len(arm["files"]), sum(f["addedCode"] for f in files),
                sum(f["holeCode"] for f in files), sum(g["public"] for g in arm["groups"].values()),
                sum(g["private"][0] for g in arm["groups"].values()), arm["usage"]["requests"],arm["usage"]["totalTokens"]]
    columns=[("上轮整题／全文检索",previous["arms"]["matched"]),("上轮整题／无历史",previous["arms"]["none"]),
             ("逐族／SAG2",data["arms"]["matched"]),("逐族／无历史",data["arms"]["none"])]
    lines=["# SymPy 逐功能族配对实验", "",
        "两组均由同一模型完成。每组有 15 个依次派发的会话和一份累积答卷，每族先测当前状态，交接时再跑公开和私有回归，末尾重新运行整题。模型只看到公开反馈。每个条件各一个样本。",
        "", "| 条件 | 逐族阶段数 | 改动文件 | 可解析文件新增代码行 | 其中原 TODO 内 | 公开通过 / 15 | 私有通过 / 897 | 模型请求 | 总 tokens |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for name,arm in columns:
        lines.append("| "+name+" | "+" | ".join(f"{v:,}" for v in totals(arm))+" |")
    for label,arm in columns[2:]:
        invalid=[(k,v) for k,v in arm["files"].items() if v.get("syntaxError")]
        if invalid:
            lines.extend(["",label+" 有 "+str(len(invalid))+" 个文件在终态无法解析。这些文件另有 "+str(sum(f["addedPhysical"] for _,f in invalid))+" 个新增物理行，未计入上表代码行。"])
    lines+=["","## 逐族前后和整题复测","",
            "每格依次为该族开工前、交接后、全部阶段结束后通过的私有用例数，分母固定。后两列依次为交接时与终态的公开探针，每格按 SAG2／无历史排列。","",
            "| 私有用例所属族 | 用例数 | SAG2 前 → 后 → 最终 | 无历史 前 → 后 → 最终 | 交接公开 | 最终公开 |",
            "|---|---:|---|---|---|---|"]
    a,b=data["arms"]["matched"],data["arms"]["none"]
    for x,y in zip(a["stages"],b["stages"],strict=True):
        g=x["group"]
        assert g==y["group"] and x["checks"]==y["checks"]
        def trace(v,arm):
            return f"{v['prior']} → {v['after']} → {arm['groups'][g]['private'][0]}"
        lines.append(f"| {g} | {x['checks']} | {trace(x,a)} | {trace(y,b)} | {x['public']} / {y['public']} | {a['groups'][g]['public']} / {b['groups'][g]['public']} |")
    lines+=["","## 终态失败定位"]
    if batch=="cas-family-v1":
        lines+=["","两组在 polys 阶段都指出 `combinatorics/permutations.py` 的共享依赖阻断了公开检查，并在最终消息中把该文件认作不可写。该路径实际包含在 354 个可写文件中；提示列出的当前族主文件与完整写权限范围不同。两组在这个阶段均未改文件。"]
    for arm,label in (("matched","SAG2"),("none","无历史")):
        trial=json.loads((path/"polycodeeval-bench"/batch/f"{data['model']}-{arm}.json").read_text(encoding="utf8"))
        worker_errors=[(k,g["error"].splitlines()[-1]) for k,g in trial["grades"]["private"]["groups"].items() if g.get("error")]
        if worker_errors:
            lines+=["",f"{label}组有 {len(worker_errors)} 个私有评分进程在执行测试列表前报错。首个错误为 `{worker_errors[0][1]}`。这些族按协议记零。"]
        check=path/f"{batch}-{arm}-syntax-control.json"
        if check.exists():
            diag=json.loads(check.read_text(encoding="utf8"))
            if diag["repairs"]:
                names="、".join(f"`{n}`" for n in diag["repairs"])
                lines+=["",f"离线诊断在 {label} 答卷副本中，将 {names} 恢复至该臂自身最近可解析的历史版本。没有追加模型调用。复测公开 {diag['totals']['public']}/15，私有 {diag['totals']['private']}/897。正式成绩使用原始答卷。[诊断结果]({check.name})"]
    lines+=["","## 交接时尚未解决的依赖","",
            "下表取每族交接时编译或公开验收的最内层报错文件。之后的功能族仍有机会修改这些依赖，最终状态见上表。","",
            "| 功能族 | SAG2 交接 | 无历史交接 |","|---|---|---|"]
    def last_frame(stage):
        if stage["public"]: return "通过"
        frames=re.findall(r'File "/candidate/(sympy/[^"]+)", line (\d+)',stage["error"] or "")
        return f"`{frames[-1][0]}:{frames[-1][1]}`" if frames else "见阶段检查记录"
    for x,y in zip(a["stages"],b["stages"],strict=True):
        lines.append(f"| {x['group']} | {last_frame(x)} | {last_frame(y)} |")
    lines+=["","## SAG2 命中与实际使用","",
            "索引覆盖四库 3,897 个生产文件。SAG2 用原始源码片段及逐文件模块摘要执行 BM25 + JEV，最多两跳。文件适配器从源码提取声明名称作为桥接词，本轮索引未构建跨文件调用边。每族前三个候选的预览进入首条模型请求。下表记录模型后续自行打开的历史文件数，以及模型在写入操作中填写的来源；引用是模型自报。各族的完整查询、排序、源码预览和编辑顺序见证据归档。",
            "","| 功能族 | 首次查询实际跳数 | 首位候选 | 后续主动历史查询 | 单独打开历史文件数 | 编辑时声明的来源 |","|---|---:|---|---:|---:|---|"]
    repo_seeds=Counter()
    for g,x in data["sag2"]["scheduled"].items():
        ev=[v for v in a["historyEvents"] if v["group"]==g]
        queries=sum(v["tool"]=="search_source" for v in ev)
        reads={v["path"] for v in ev if v["tool"]=="read_slice"}
        for h in x['hits']:repo_seeds[h['path'].split('/')[1]]+=1
        src=sorted({s for e in a["edits"] if e.get("group")==g for s in e.get("sources",[]) if isinstance(s,str)})
        lines.append(f"| {g} | {x['hops']} | `{x['hits'][0]['path']}` | {queries} | {len(reads)} | "+ (", ".join(f"`{p}`" for p in src) or "无")+" |")
    lines+=["", "各仓在 45 个初始候选中的出现次数为 "+ "，".join(f"{r} {n}" for r,n in sorted(repo_seeds.items()))+"。",
            "", "两组都使用同一套拆分与失败反馈。逐族两臂可比较本轮是否接入 SAG2 时的观测差值；跨轮同时改变了调度和提示，有历史条件还更换了检索器。单对结果不能独立估计这些变化的因果贡献。",
            "",f"[逐族原始统计和测试 ID]({batch}-comparison.json) · [完整归档含补丁和工具事件]({batch}-evidence.json.gz) · [旧版退出原因](../src/cas-pilot/finish-diagnosis.md) · [复现说明](../src/cas-pilot/README.md)"]
    (path/f"{batch}.md").write_bytes(("\n".join(lines)+"\n").encode())


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("batch");report(p.parse_args().batch)
