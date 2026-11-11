import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checks } from "./checks.mjs";
import { tasks } from "./tasks.mjs";
const [id, mode] = process.argv.slice(2);
const task = tasks.find(t => t.id === id);
const suite = checks[id];
const work = mkdtempSync(join(tmpdir(),"recast-pilot-"));
try {
  cpSync("src",join(work,"src"),{recursive:true});
  writeFileSync(join(work,"package.json"),'{"type":"commonjs"}');
  if (mode.startsWith("compile")) {
    const units = mode === "compile" ? task.units : task.units.filter(u => "compile-"+u.name===mode);
    assert(units.length);
    for(const u of units){
      const r=spawnSync(process.execPath,["--check",u.path],{cwd:work,encoding:"utf8"});
      if(r.status!==0) throw Error(r.stderr || String(r.error));
    }
  } else {
    const groups = mode === "external" ? ["general","contract"] :
      mode === "all" && suite.integration ? ["public","integration"] : ["public"];
    // Only arguments and the entry point enter the candidate process. Expected
    // answers and the legacy implementations remain outside its module tree.
    const invoke = `const {fn,args}=JSON.parse(require("node:fs").readFileSync(0,"utf8"));
const impl=require("./src/"+fn+".js")[fn];
if(typeof impl!=="function") process.exit(2);
try { const value=impl(...args); console.log(JSON.stringify({value})); }
catch { console.log(JSON.stringify({threw:true})); }`;
    const results = groups.map(group=>{
      const cases=suite[group].filter(c=>mode==="external"||mode==="all"||mode===c.fn).map(c=>{
        const r=spawnSync(process.execPath,["-e",invoke],{cwd:work,input:JSON.stringify({fn:c.fn,args:c.args}),encoding:"utf8",timeout:5000});
        let passed=false;
        try {
          assert.equal(r.status,0);
          const got=JSON.parse(r.stdout.trim());
          assert.deepEqual(got,c.throws?{threw:true}:{value:c.expected});passed=true;
        } catch {
          if(group==="public") console.error(c.name, r.stderr || r.stdout, "expected", JSON.stringify(c.throws?{threw:true}:{value:c.expected}));
        }
        return {name:c.name,passed};
      });
      assert(cases.length>0);
      return {id:group,passed:cases.every(c=>c.passed),cases};
    });
    if(mode==="external") console.log(JSON.stringify(results));
    else if(!results.every(g=>g.passed)) process.exitCode=1;
    else console.log("Public checks passed");
  }
} finally { rmSync(work,{recursive:true,force:true,maxRetries:3}); }
