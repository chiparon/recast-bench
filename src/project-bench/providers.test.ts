import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectClient } from "./providers.ts";

test("records a non-retryable provider diagnostic in the call trace and thrown error", async (t) => {
  const key = "local-provider-test-key";
  const old = process.env.OPENAI_API_KEY;
  const file = process.env.RECAST_KEY_FILE;
  process.env.OPENAI_API_KEY = key;
  delete process.env.RECAST_KEY_FILE;
  t.after(() => {
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
    if (file !== undefined) process.env.RECAST_KEY_FILE = file;
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
    error: { code: "invalid_prompt", type: "invalid_request_error", param: "input[2]",
      message: "Invalid tool item for " + key },
  }, { status: 400, headers: { "x-request-id": "req-test" } }));
  const client = createProjectClient("gpt-6-luna");
  await assert.rejects(client.complete([], []), /HTTP 400 invalid_prompt Invalid tool item for \[redacted\]/);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(client.trace[0].requestId, "req-test");
  assert.deepEqual(client.trace[0].providerError, { code: "invalid_prompt", type: "invalid_request_error",
    param: "input[2]", message: "Invalid tool item for [redacted]" });
  assert.equal(client.trace[0].usage, null);
});
