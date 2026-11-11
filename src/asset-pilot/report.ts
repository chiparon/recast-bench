import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { join,resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fixture } from "./fixtures.ts";
import { tasks } from "./tasks.mjs";
import { arms,batch,identity,load,model,results } from "./protocol.ts";
import { gradeDelivery } from "../real-projects/grading.ts";
import { manifest } from "../real-projects/inputs.ts";
import { sumUsage } from "../large-projects/meter.ts";

const signature=await identity();
const controls=[],rows=[];
for(const t of tasks){
  const c=await load(join(results,t.id+".control.json")),f=fixture(t.id);
  assert.deepEqual(c.signature,signature);
  assert.equal((await manifest(c.starter,f)).hash,c.frozen.hash);
  const ledger=c.task.referenceFiles.filter(p=>p.startsWith("refs/ledger/"));
  let domainLines=0;
  for(const path of ledger){
    const content=await readFile(join(c.starter,path),"utf8");
    domainLines+=content.split("\n").length-Number(content.endsWith("\n")||!content);
  }
  controls.push({task:t.id,title:t.title,shape:t.shape,history:t.history,groundTruth:t.keys,anchor:t.anchor,focal:t.focal,
    fixedModules:c.task.modules,requirement:c.task.requirement,hash:c.frozen.hash,corpusHash:c.corpusHash,scale:c.history,
    domainLines,indexedLines:c.history.lines+domainLines,indexedFiles:c.task.referenceFiles.length,
    preflight:c.preflight,golden:c.positive,starter:c.hollow,frozenAt:c.frozenAt});
  for(const arm of arms){
    const r=await load(join(results,t.id+"_"+arm+".trial.json"));
    assert.equal(r.id,t.id+"_"+arm);
    assert.deepEqual(r.signature,signature);assert.equal(r.treeHash,c.frozen.hash);
    assert.equal(r.corpusHash,c.corpusHash);assert.equal(r.model,model);assert.equal(r.arm,arm);
    assert.deepEqual(sumUsage(r.calls),r.usage);
    assert(r.calls.some(x=>x.status==="ok")&&r.calls.filter(x=>x.status==="ok").every(x=>x.servedModel===model));
    const grade=await gradeDelivery(f,c.starter,c.frozen,r.outputRoot,r.commit);
    assert.deepEqual(grade,r.grade);
    assert.equal(r.passed,Boolean(r.commit&&grade.passed&&!r.error));
    if(arm.startsWith("sag2")){
      assert.deepEqual([...r.indexFiles].sort(),[...c.task.referenceFiles].sort());
      for(const z of r.previews) {
        assert(z.sources.every(k=>r.selected.some(v=>v.unit===z.unit&&v.paths.includes(k.path))));
      }
    }
    const {work,outputRoot,indexFiles,...record}=r;
    const runtime=await load(join(work,"runtime.json"));
    const keyExcerpts=(runtime.translations??[]).flatMap(z=>z.record.request.context
      .filter(k=>k.kind==="source"&&t.keys.includes(k.path))
      .map(k=>({unit:z.unit,path:k.path,content:k.content})));
    const submitted=Object.fromEntries(await Promise.all(f.modules.map(async u=>
      [u.path,await readFile(join(outputRoot,u.path),"utf8")])));
    rows.push({...record,task:t.id,keyExcerpts,submitted,localWork:work});
  }
}
assert.equal(rows.length,24);
assert.equal(new Set(controls.map(c=>c.corpusHash)).size,1);
assert(Math.max(...controls.map(c=>Date.parse(c.frozenAt)))<Math.min(...rows.map(r=>Date.parse(r.startedAt))));
const group=(r,id)=>r.grade.checks.find(c=>c.id===id)?.cases??[];
const passed=(r,id)=>group(r,id).filter(x=>x.passed).map(x=>x.name);
const ratio=(r,id)=>passed(r,id).length+"/"+group(r,id).length;
const lookup=(t,arm)=>rows.find(r=>r.task===t&&r.arm===arm);
const hasAll=(paths,keys)=>keys.length>0&&keys.every(k=>paths.includes(k));
const shown=(r,unit)=>r.previews.filter(z=>!unit||z.unit===unit).flatMap(z=>z.sources.map(s=>s.path));
const comparison=controls.map(c=>{
  const one=lookup(c.task,"sag2-1hop"),two=lookup(c.task,"sag2-2hop");
  const detail=r=>{
    const p=r.previews.find(z=>z.unit===c.focal);
    const search=r.selected.find(z=>z.unit===c.focal);
    return {reached:Boolean(p),keyInPreview:hasAll(shown(r,c.focal),c.groundTruth),
      keyInAnyPreview:hasAll(shown(r),c.groundTruth),
      keyRead:hasAll(r.readPaths,c.groundTruth),newInHop2:hasAll(search?.newTopPaths??[],c.groundTruth),
      ranked:search?.paths??[],hops:search?.hopsExecuted??0};
  };
  const a=passed(one,"contract"),b=passed(two,"contract");
  return {task:c.task,one:detail(one),two:detail(two),
    additionalCases:b.filter(k=>!a.includes(k)),lostCases:a.filter(k=>!b.includes(k)),onePassed:one.passed,twoPassed:two.passed};
});
const base=resolve("results",batch);
await writeFile(base+"-evidence.json.gz",gzipSync(Buffer.from(JSON.stringify({batch,model,signature,
  verifiedAt:new Date().toISOString(),controls,rows,comparison}))));
const renderOutcome=r=>(r.passed?"通过":"失败")+" · "+ratio(r,"contract");
const docs=["# 六类历史资产任务试跑","",
 "GPT-6 Luna。6 道自建 CommonJS 迁移题，每题 4 种方法、每种 1 次，共 24 次串行试验，按题轮换方法顺序。题目业务行为由小型、可执行的 Python 历史资产定义；背景库使用 LuaJIT、go-yaml、diff-match-patch 的冻结源码快照。六题共享完全相同的历史文件，各组都能主动读取。共同背景的实际索引规模为 "+controls[0].scale.lines.toLocaleString("en-US")+" 行、"+controls[0].scale.files+" 个文件，另有 6 个业务历史文件。","","## 整题与兼容行为","",
 "表内记录整题交付状态与通过的独立行为用例数。需求自足题使用公开契约的边界用例；其余四题使用历史兼容用例。整题还要求公开构建、模块及组装测试、外部一般用例、只读文件完整性和 Git 交付。","","| 任务 | 类别 | rawagent | 原 RECAST | SAG2 单跳 | SAG2 双跳 |","|---|---|---|---|---|---|"];
for(const c of controls)docs.push("| "+[c.title,c.shape+" / "+c.history,...arms.map(arm=>renderOutcome(lookup(c.task,arm)))].join(" | ")+" |");
docs.push("","## 单跳与双跳的关键模块","",
 "关键文件及其对应模块在模型试验前标注。两组 Top-K 均为 3，使用同一结构 JEV、索引输入和生产上下文上限（120,000 字符，每候选预览最多 24,000 字符）。有桥接词时启用扩展，唯一切换的检索参数是 maxHops。表中“送入”只统计关键目标模块收到的非空源码预览，主动读取另列；“首次发现”来自检索器的第二跳新增 ID。","","| 任务 | 关键历史文件 | 静态单跳 / 双跳 Top-3 | 实际单跳 / 双跳送入 | 双跳首次发现 | 单跳 / 双跳主动读取 | 双跳独有通过 / 单跳独有通过 |","|---|---|---|---|---|---|---|");
const yn=x=>x?"是":"否";
for(const c of controls.filter(c=>c.groundTruth.length)){
 const p=comparison.find(p=>p.task===c.task)!;
 const staticHit=h=>hasAll(c.preflight.find(z=>z.unit===c.focal&&z.maxHops===h).ranked,c.groundTruth);
 const live=z=>z.reached?yn(z.keyInPreview):"未执行";
 docs.push("| "+[c.title,c.groundTruth.map(k=>"`"+k+"`").join("、"),yn(staticHit(1))+" / "+yn(staticHit(2)),live(p.one)+" / "+live(p.two),yn(p.two.newInHop2),yn(p.one.keyRead)+" / "+yn(p.two.keyRead),(p.additionalCases.join("、")||"无")+" / "+(p.lostCases.join("、")||"无")].join(" | ")+" |");
}
docs.push("","主动读取记录来自模型收到的 read_file 工具结果。下表按整次试验统计，所以还包括其他目标模块的主动读取。","","| 历史兼容任务 | rawagent 读关键文件 | 原 RECAST 读关键文件 | 单跳读关键文件 | 双跳读关键文件 |","|---|---|---|---|---|");
for(const c of controls.filter(c=>c.groundTruth.length))
  docs.push("| "+[c.title,...arms.map(a=>yn(hasAll(lookup(c.task,a).readPaths,c.groundTruth)))].join(" | ")+" |");
docs.push("","## 资源消耗","","平均时间计入失败、冷建索引和评分。token 为输入与输出合计。","","| 方法 | 整题通过 | 平均秒/题 | 六题累计 token |","|---|---:|---:|---:|");
for(const arm of arms){
 const sample=rows.filter(r=>r.arm===arm);
 docs.push("| "+[arm,sample.filter(r=>r.passed).length+"/6",(sample.reduce((s,r)=>s+r.wallMs,0)/6000).toFixed(1),(sample.every(r=>r.usage.usageComplete)?"":"≥ ")+sample.reduce((s,r)=>s+r.usage.totalTokens,0).toLocaleString("en-US")].join(" | ")+" |");
}
docs.push("","## 双跳新增文件对应的交付结果","");
for(const c of controls.filter(c=>c.groundTruth.length)){
  const v=comparison.find(p=>p.task===c.task)!;
  if(!v.one.reached||!v.two.reached||v.one.keyInPreview||!v.two.keyInPreview||!v.two.newInHop2) continue;
  const one=lookup(c.task,"sag2-1hop"),two=lookup(c.task,"sag2-2hop");
  docs.push("- "+c.title+"：单跳 → 双跳兼容用例 "+ratio(one,"contract")+" → "+ratio(two,"contract")+
    "，整题 "+(one.passed?"通过":"失败")+" → "+(two.passed?"通过":"失败")+"。"+
    (v.one.keyRead?"单跳组在试验中主动读取了关键文件。":"单跳组的工具回执中没有关键文件的成功读取记录。"));
}
docs.push("","每题的共同索引共 "+controls[0].indexedFiles+" 个源码文件、"+controls[0].indexedLines.toLocaleString("en-US")+" 个物理行，含业务历史 "+controls[0].domainLines+" 行。","","## 逐次记录","","| 题号 | 方法 | 整题 | 一般用例 | 契约或兼容用例 | 秒 | token |","|---|---|---|---|---:|---:|---:|");
for(const r of rows)docs.push("| "+[r.task,r.arm,r.passed?"通过":"失败",ratio(r,"general"),ratio(r,"contract"),(r.wallMs/1000).toFixed(1),(r.usage.usageComplete?"":"≥ ")+r.usage.totalTokens.toLocaleString("en-US")].join(" | ")+" |");
docs.push("","## 扩题决策","");
if(rows.filter(r=>r.passed).length>=rows.length-1){
  docs.push(rows.filter(r=>r.passed).length+"/"+rows.length+" 次整题通过。当前任务接近通过率天花板，先保留这六题作校准，不按当前难度直接扩到 24 题。");
}
docs.push("优先在两道二跳题上做同位置的关键源码替换对照，固定其他候选、公开样例、上下文预算与工具权限；单列自然运行时主动补读的次数与耗时。后续题目优先取自真实版本迁移，包括仍被调用的旧版本、可混淆的近邻实现，以及只在多个模块组合后才出现的行为差异。用独立试跑校准难度，冻结后再做正式重复。","",
"单次配对可观察候选、上下文、兼容行为与整题结果是否同向改变。主动读取同一历史库、模型采样波动以及候选被替换，都会影响结果。此试跑未执行固定其他候选、仅替换关键模块的干预对照。","",
 "[题目定义](../src/asset-pilot/tasks.mjs) · [预先定义的验收用例](../src/asset-pilot/checks.mjs) · [24 次配对证据](asset-pilot-v1-evidence.json.gz)","");
await writeFile(base+".md",docs.join("\n"));
console.log(docs.slice(0,docs.indexOf("## 逐次记录")).join("\n"));
