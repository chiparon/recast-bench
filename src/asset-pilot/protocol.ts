import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha } from "../real-projects/inputs.ts";
import { protocolFingerprint } from "../polycodeeval/protocol.ts";

export const batch="asset-pilot-v1", model="gpt-6-luna";
export const arms=["rawagent","recast","sag2-1hop","sag2-2hop"] as const;
export type Arm=typeof arms[number];
export const results=resolve("results/asset-pilot",batch), work=resolve("work/asset-pilot",batch);
export const load=async (path:string)=>JSON.parse(await readFile(path,"utf8"));
export async function identity(){
  const dir=dirname(fileURLToPath(import.meta.url));
  const entries=[];
  for (const p of (await readdir(dir,{recursive:true})).sort()){
    if(!/\.(?:ts|mjs|py)$/.test(p)||p.includes("__pycache__")||p.startsWith("report")) continue;
    entries.push([p.replaceAll("\\","/"),sha(await readFile(join(dir,p)))]);
  }
  const protocol=await protocolFingerprint();
  return {...protocol,pilotHash:sha(JSON.stringify(entries)),batch,model};
}
