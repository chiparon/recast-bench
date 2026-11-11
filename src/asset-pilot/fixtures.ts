import { execFile } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tasks } from "./tasks.mjs";
import { checks } from "./checks.mjs";
import type { RealFixture } from "../real-projects/types.ts";

const execute = promisify(execFile);
const assets = dirname(fileURLToPath(import.meta.url));
export function fixture(id: string): RealFixture {
  const t = tasks.find(t => t.id === id)!;
  const command = (mode: string) => ({ executable:process.execPath,args:[join(assets,"driver.mjs"),id,mode],timeoutMs:120_000 });
  const requirement = [
    t.title, "Implement the listed CommonJS exports. Each file exports its named function using module.exports. Finished src must run as a standalone package; refs are read-only migration inputs and are absent at deployment. All inputs and results use JSON types.",
    ...t.units.map(u => u.name+"("+u.args+"): "+u.description),
    "Public examples:",JSON.stringify([...checks[id].public, ...(checks[id].integration ?? [])]),
  ].join("\n");
  return {
    id, title:t.title, requirement, upstream:{url:"local:asset-pilot",commit:"asset-pilot-v1"},
    modules:t.units.map(({name,path,language,description,dependsOn})=>({name,path,language,description,dependsOn})),
    references:[],compile:command("compile"),test:command("all"),
    moduleCompiles:Object.fromEntries(t.units.map(u=>[u.name,command("compile-"+u.name)])),
    moduleTests:Object.fromEntries(t.units.map(u=>[u.name,command(u.name)])),
    productionFiles:p=>/\.(?:c|h|cpp|hpp|cs|go|java|js|py|ts)$/.test(p),
    async prepare(root,variant) {
      await mkdir(join(root,"src"),{recursive:true});
      await writeFile(join(root,"package.json"),'{"name":"pilot-target","private":true,"type":"commonjs"}\n');
      await writeFile(join(root,"SPEC.md"),requirement+"\n");
      await execute("python",[join(assets,"extract.py"),root],{windowsHide:true});
      await cp(join(assets,"history"),join(root,"refs/ledger"),{recursive:true});
      for(const u of t.units){
        const imports=u.dependsOn.map(name=>"const { "+name+" } = require('./"+name+".js');");
        const implementation = variant==="golden" ? u.golden : "function "+u.name+"("+u.args+") { throw new Error('not implemented'); }";
        await writeFile(join(root,u.path),[...imports,implementation,"module.exports = { "+u.name+" };",""].join("\n"));
      }
    },
    async grade(root) {
      const {stdout}=await execute(process.execPath,command("external").args,{cwd:root,windowsHide:true,timeout:120_000});
      return JSON.parse(stdout);
    },
  };
}
