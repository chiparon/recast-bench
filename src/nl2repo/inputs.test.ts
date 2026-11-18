import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import test from "node:test";
import { RealProjectFiles, git } from "../real-projects/method-files.ts";

for (const project of ["sqlparse", "rich-click", "deepdiff", "boltons", "jinja"]) {
  test(`${project}: independent method snapshots retain identical public bytes`, async () => {
    const recipe = JSON.parse(await readFile(`work/nl2repo/cases/${project}.json`, "utf8"));
    const requirement = await readFile(join(recipe.starter, "TASK.md"), "utf8");
    assert((requirement + "\n\nPublic module manifest:\n" + JSON.stringify(recipe.modules)).length <= 8000);
    assert(Object.keys(recipe.input.files).length <= 256);
    assert(Object.keys(recipe.input.files).every(p => !p.startsWith("tests/") && !p.includes(".git/")));
    await mkdir("work/nl2repo/snapshot-checks", { recursive: true });
    const storage = await mkdtemp(resolve("work/nl2repo/snapshot-checks", project + "-"));
    for (const method of ["recast", "codex"]) {
      const snapshot = await new RealProjectFiles(join(storage, method)).snapshot(recipe.starter, randomUUID(), new AbortController().signal);
      assert.equal(await git(snapshot.outputRoot, ["rev-list", "--count", "HEAD"]), "1");
      for (const [name, hash] of Object.entries(recipe.input.files)) {
        const content = await readFile(join(snapshot.outputRoot, name));
        assert.equal(createHash("sha256").update(content).digest("hex"), hash, name);
        assert(content.toString("utf8").length <= 256_000, name + " exceeds shared read_file limit");
      }
    }
  });
}
