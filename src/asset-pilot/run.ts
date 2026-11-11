import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { manifest } from "../real-projects/inputs.ts";
import { gradeDelivery } from "../real-projects/grading.ts";
import { runRealMethod } from "../real-projects/methods.ts";
import { existing,json } from "../polycodeeval/protocol.ts";
import { meterExisting,sumUsage,type MeterCall } from "../large-projects/meter.ts";
import { waitForProvider } from "../large-projects/transport.ts";
import { fixture } from "./fixtures.ts";
import { tasks } from "./tasks.mjs";
import { arms,batch,identity,load,model,results,work } from "./protocol.ts";
const signature=await identity();
const controls=await Promise.all(tasks.map(t=>load(join(results,t.id+".control.json"))));
assert.equal(new Set(controls.map(c=>c.corpusHash)).size,1);
for(const c of controls){
  assert.deepEqual(c.signature,signature);assert.equal((await manifest(c.starter,fixture(c.task.id))).hash,c.frozen.hash);
}
const lock=join(results,"matrix.lock"),handle=await open(lock,"wx");
try {
 await handle.writeFile(String(process.pid));await handle.close();
 for(const [i,c] of controls.entries()){
  for(let j=0;j<arms.length;j++){
    const arm=arms[(i+j)%arms.length], id=c.task.id+"_"+arm, dst=join(results,id+".trial.json");
    const prior=await existing(dst);
    if(prior){assert.deepEqual(prior.signature,signature);assert.equal(prior.treeHash,c.frozen.hash);continue;}
    const dir=await mkdtemp(join(work,"trial-"));
    const calls:MeterCall[]=[],readPaths=new Set<string>();
    await waitForProvider(model);
    const transport=meterExisting(model,call=>{calls.push(call);});
    const client={complete:async (...args:Parameters<typeof transport.client.complete>)=>{
      // Inspect the actual tool reply sent to the next model call (all four arms).
      for(const m of args[0]){
        if(m.role!=="tool"||!m.content.includes('"path"'))continue;
        try{const v=JSON.parse(m.content);if(typeof v.path==="string"&&typeof v.content==="string"&&!v.error)readPaths.add(v.path);}catch{}
      }
      return transport.client.complete(...args);
    }};
    const startedAt=new Date().toISOString(),start=performance.now();
    console.log("START",id,startedAt,dir);
    try{
      const r=await runRealMethod({arm:arm.startsWith("sag2-")?"sag2sql":arm==="rawagent"?"rawagent":"recast",client,task:c.task,sourceRoot:c.starter,runRoot:dir,
        ...(arm.startsWith("sag2-")&&{retrieval:{maxHops:arm==="sag2-1hop"?1:2,expandOnBridgeTerms:true}})});
      const grade=await gradeDelivery(fixture(c.task.id),c.starter,c.frozen,r.outputRoot,r.commit);
      const wallMs=performance.now()-start;
      const passed=Boolean(r.commit&&grade.passed&&!r.error);
      const rt=r.runtime as any;
      const previews=(rt.translations??[]).map((z:any)=>({unit:z.unit,status:z.record.status,
        sources:z.record.request.context.filter((k:any)=>k.kind==="source"&&k.path).map((k:any)=>({path:k.path,chars:k.content.length})),
        mounted:z.record.request.historyView?.files??[]}));
      await json(join(dir,"runtime.json"),rt);
      await json(dst,{id,batch,model,arm,signature,treeHash:c.frozen.hash,corpusHash:c.corpusHash,startedAt,wallMs,work:dir,
        outputRoot:r.outputRoot,commit:r.commit,passed,error:r.error,indexMs:r.indexMs,calls,usage:sumUsage(calls),grade,
        selected:rt.selectedHistory??[],previews,readPaths:[...readPaths],indexFiles:rt.indexFiles??null});
      console.log("END",id,passed,Math.round(wallMs/1000),sumUsage(calls).totalTokens);
    }finally{transport.close();}
  }
 }
}finally{await unlink(lock);}
