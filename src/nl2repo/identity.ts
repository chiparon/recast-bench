import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
export function productIdentity() {
  const product = resolve("../weichai");
  return {
    productRevision: execFileSync("git", ["-C", product, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    productDiffHash: sha(execFileSync("git", ["-C", product, "diff", "HEAD", "--", "apps", "packages", "services"], { maxBuffer: 32 * 1024 * 1024, windowsHide: true })),
  };
}
export async function implementationHash() {
  const files: Record<string, string> = {};
  for (const directory of ["src/nl2repo", "src/large-projects", "src/real-projects", "src/project-bench"]) {
    for (const entry of (await readdir(directory, { recursive: true, withFileTypes: true }))) {
      if (!entry.isFile() || !/\.(ts|mjs|py|sh|txt|json)$/.test(entry.name) || entry.parentPath.includes("__pycache__")) continue;
      const path = join(entry.parentPath, entry.name);
      files[path.replaceAll("\\", "/")] = sha(await readFile(path));
    }
  }
  return sha(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))));
}
