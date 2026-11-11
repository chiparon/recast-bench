import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { compileWorkspace } from "../../../weichai/services/adaptation-service/src/workspace-compiler.ts";
import { manifest, publicTask, sha } from "../real-projects/inputs.ts";
import { publicCommand } from "../real-projects/method-files.ts";
import { openRealIndex } from "../real-projects/method-index.ts";
import { projectModules,searchRealModule } from "../real-projects/methods.ts";
import { indexedHistoryStats } from "../polycodeeval/scope.ts";
import { json } from "../polycodeeval/protocol.ts";
import { tasks } from "./tasks.mjs";
import { fixture } from "./fixtures.ts";
import { identity,results,work } from "./protocol.ts";

const signal=new AbortController().signal;
const signature=await identity();
await Promise.all([mkdir(results,{recursive:true}),mkdir(work,{recursive:true})]);
for(const definition of tasks){
  const f=fixture(definition.id), base=await mkdtemp(join(work,"control-")), starter=join(base,"s"),golden=join(base,"g");
  await f.prepare(starter,"starter");await f.prepare(golden,"golden");
  const frozen=await manifest(starter,f),oracle=await manifest(golden,f);
  assert.deepEqual(Object.keys(frozen.files),Object.keys(oracle.files));
  assert.deepEqual(Object.keys(frozen.files).filter(p=>frozen.files[p]!==oracle.files[p]).sort(),f.modules.map(m=>m.path).sort());
  const task={...publicTask(f,frozen),fullHistoryRoot:"refs/history" as const};
  const execute=(cmd:typeof f.test)=>compileWorkspace(starter,publicCommand(cmd),signal);
  const hollow=await f.grade(starter);
  assert(hollow.find(c=>c.id==="contract")!.cases!.every(c=>!c.passed));
  for (const u of f.modules){
    assert(!(await execute(f.moduleTests![u.name])).success);
    await copyFile(join(golden,u.path),join(starter,u.path));
    for(const cmd of [f.moduleCompiles![u.name],f.moduleTests![u.name]]){
      const verdict=await execute(cmd);assert(verdict.success,verdict.output);
    }
  }
  const full=await execute(f.test);assert(full.success,full.output);
  const positive=await f.grade(starter);assert(positive.every(c=>c.passed),JSON.stringify(positive));
  if(f.modules.length>1){
    // A joint-only defect must escape the single-example module check yet fail the assembled suite.
    const u=f.modules.at(-1)!,path=join(starter,u.path);
    await writeFile(path,(await readFile(path,"utf8"))+
      "\nconst original = module.exports."+u.name+";\nmodule.exports."+u.name+
      " = (...args) => args.some(a => Array.isArray(a) && a.length > 1) ? null : original(...args);\n");
    assert((await execute(f.moduleTests![u.name])).success);
    assert(!(await execute(f.test)).success);
  }
  await f.prepare(starter,"starter");
  assert.equal((await manifest(starter,f)).hash,frozen.hash);
  const idx=await openRealIndex(task,starter,join(base,"index"),signal);
  try {
    const history=await indexedHistoryStats(starter,frozen,idx.indexedFiles);
    const indexed=idx.indexedFiles.slice().sort();
    assert(task.referenceFiles.every(p=>indexed.includes(p)));
    assert(definition.keys.every(p=>indexed.includes(p)));
    const preflight=[];
    for(const unit of projectModules(task)){
      for(const hops of [1,2] as const){
        const result=await searchRealModule(idx,unit,task.modules.find(u=>u.name===unit.id)!.description,signal,{maxHops:hops,expandOnBridgeTerms:true});
        preflight.push({unit:unit.id,maxHops:hops,hopsExecuted:result.hopsExecuted,newTopPaths:result.newTopPaths,
          ranked:result.candidates.flatMap(c=>c.sourceModule?.sourceFiles??[])});
      }
    }
    const corpusHash=sha(JSON.stringify(indexed.map(p=>[p,frozen.files[p]])));
    await json(join(results,f.id+".control.json"),{signature,task,starter,frozen,history,corpusHash,preflight,hollow,positive,
      keys:definition.keys,anchor:definition.anchor??null,focal:definition.focal??null,frozenAt:new Date().toISOString()});
    console.log("FROZEN",f.id,history.lines,corpusHash.slice(0,12),JSON.stringify(preflight.filter(p=>p.unit===definition.focal)));
  }finally{await idx.close();}
}
