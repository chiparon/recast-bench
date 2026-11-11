import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compileWorkspace } from "../../../weichai/services/adaptation-service/src/workspace-compiler.ts";
import { publicCommand } from "../real-projects/method-files.ts";
import type { Command } from "../real-projects/types.ts";
import { fixtures } from "./cases.ts";
import { freezePoly, polyScope } from "./scope.ts";

for (const fixture of fixtures.filter((f) => /^poly-(py|go)-/.test(f.id))) {
  test(fixture.id + " accepts each implemented module with later modules still hollow", async (t) => {
    const temp = await mkdtemp(join(tmpdir(), "poly-stages-"));
    t.after(() => rm(temp, { recursive: true, force: true, maxRetries: 3 }));
    const workspace = join(temp, "starter");
    const golden = join(temp, "golden");
    const { m } = await freezePoly(fixture, workspace, "starter");
    const { task } = await polyScope(fixture, workspace, m);
    await fixture.prepare(golden, "golden");
    const run = (command: Command) =>
      compileWorkspace(workspace, publicCommand(command), new AbortController().signal);

    for (const unit of task.modules) {
      const testCommand = task.moduleTestCommands![unit.name];
      assert.equal((await run(testCommand)).success, false, unit.name + " accepted its empty skeleton");
      await copyFile(join(golden, unit.path), join(workspace, unit.path));
      for (const command of [task.moduleCompileCommands![unit.name], testCommand]) {
        const result = await run(command);
        assert(result.success, unit.name + ": " + result.output);
      }
      if (unit === task.modules[0]) {
        assert.equal((await run(task.testCommand)).success, false, "Incomplete project passed integration");
      }
    }
    for (const command of [task.compileCommand, task.testCommand]) {
      const result = await run(command);
      assert(result.success, result.output);
    }
    const checks = await fixture.grade(workspace);
    assert(checks.every((c) => c.passed));
    assert.equal(checks.flatMap((c) => c.cases ?? []).length, fixture.id.startsWith("poly-py-") ? 41 : 45);
  });
}
