import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = resolve(__dirname, "../../..");
const DATASETS_ROOT = join(BENCH_ROOT, "work/polycodeeval-upstream/datasets");
const TOOLS_ROOT = join(BENCH_ROOT, "work/tools");

const GXX = "E:\\msys2\\mingw64\\bin\\g++.exe";
const MINGW_BIN = "E:\\msys2\\mingw64\\bin";
const GTEST_INC = join(DATASETS_ROOT, "cpp/snappy/src/third_party/googletest/googletest/include");
const GTEST_LIB = join(TOOLS_ROOT, "gtest/libgtest.a");

const JAVAC = "E:\\Program Files\\BellSoft\\LibericaJDK-21\\bin\\javac.exe";
const JAVA = "E:\\Program Files\\BellSoft\\LibericaJDK-21\\bin\\java.exe";
const JUNIT_JAR = join(TOOLS_ROOT, "junit/junit-platform-console-standalone.jar");

const PYTHON = "C:\\Users\\chiparon\\miniconda3\\python.exe";
const PYTEST_SITE = join(TOOLS_ROOT, "pytest");

const GO_BIN = join(TOOLS_ROOT, "go/bin/go.exe");

const [taskId, mode] = process.argv.slice(2);
const workspaceRoot = process.cwd();

function runProc(exe, args, opts = {}) {
  const env = {
    ...process.env,
    PATH: `${MINGW_BIN};${dirname(GO_BIN)};${process.env.PATH || ""}`,
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONIOENCODING: "utf-8",
    ...(opts.env || {}),
  };
  const res = spawnSync(exe, args, {
    cwd: opts.cwd || workspaceRoot,
    env,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeout || 60_000,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const ok = res.status === 0 && !res.error;
  const output = [res.stdout || "", res.stderr || "", res.error ? String(res.error) : ""]
    .filter(Boolean)
    .join("\n")
    .trim();
  return { ok, status: res.status, stdout: res.stdout || "", stderr: res.stderr || "", output };
}

// Per-test-case results: [{ name, passed }]. Lets the grader award partial credit
// instead of a single pass/fail per module check.
function mergeCases(list) {
  const map = new Map();
  for (const c of list) map.set(c.name, (map.get(c.name) ?? true) && c.passed);
  return [...map].map(([name, passed]) => ({ name, passed }));
}

function parseGtestCases(output) {
  const out = [];
  for (const line of output.split(/\r?\n/)) {
    const m = /^\[\s+(OK|FAILED)\s+\]\s+([\w./]+)(?:\s+\(\d+ ms\))?\s*$/.exec(line);
    if (m) out.push({ name: m[2], passed: m[1] === "OK" });
  }
  return mergeCases(out);
}

function parseGoCases(output) {
  const out = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    try {
      const e = JSON.parse(line);
      if (e.Test && (e.Action === "pass" || e.Action === "fail"))
        out.push({ name: e.Test, passed: e.Action === "pass" });
    } catch {}
  }
  return mergeCases(out);
}

function parseJunitXmlCases(dir, only) {
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".xml") && (!only || x === only))) {
    const xml = readFileSync(join(dir, f), "utf8");
    const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
    let m;
    while ((m = re.exec(xml))) {
      const attr = (k) => new RegExp(`\\b${k}="([^"]*)"`).exec(m[1])?.[1] ?? "";
      const body = m[3] ?? "";
      if (/<skipped\b/.test(body)) continue;
      out.push({
        name: `${attr("classname")}.${attr("name")}`,
        passed: !/<(failure|error)\b/.test(body),
      });
    }
  }
  return mergeCases(out);
}

function withTempDir(prefix, fn) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

// ============================================================================
// 1. C++ (cpp/logistic_system)
// ============================================================================
function patchCppTestFile(srcPath, destPath) {
  let content = readFileSync(srcPath, "utf8");
  content = content.replaceAll("../src/include/", "");
  content = content.replaceAll('system("mkdir -p /workspace/data");', 'std::filesystem::create_directories("data");');
  content = content.replaceAll('"/workspace/data/', '"data/');
  if (!content.includes("<filesystem>")) {
    content = "#include <filesystem>\n" + content;
  }
  writeFileSync(destPath, content, "utf8");
}

function normalizeWs(s) {
  return s
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
    .join("\n");
}

function runCppCheck(checkId, tmp) {
  const ds = join(DATASETS_ROOT, "cpp/logistic_system");
  const incDir = join(workspaceRoot, "include");
  const accCpp = join(workspaceRoot, "src/account.cpp");
  const expCpp = join(workspaceRoot, "src/expressage.cpp");
  const logCpp = join(workspaceRoot, "src/logistics.cpp");
  const mainCpp = join(workspaceRoot, "src/main.cpp");
  mkdirSync(join(tmp, "data"), { recursive: true });

  if (checkId === "account") {
    const testFile = join(tmp, "test_account_node.cpp");
    patchCppTestFile(join(ds, "blackbox_tests/test_account_node.cpp"), testFile);
    const exe = join(tmp, "test_account.exe");
    const c = runProc(GXX, ["-std=c++17", "-O0", "-Wno-return-type", `-I${incDir}`, `-I${GTEST_INC}`, testFile, accCpp, GTEST_LIB, "-o", exe], { cwd: tmp });
    if (!c.ok) return { id: checkId, passed: false, error: c.output };
    const r = runProc(exe, [], { cwd: tmp });
    return { id: checkId, passed: r.ok, error: r.ok ? undefined : r.output, cases: parseGtestCases(r.output) };
  }

  if (checkId === "expressage") {
    const testFile = join(tmp, "test_expressage_node.cpp");
    patchCppTestFile(join(ds, "blackbox_tests/test_expressage_node.cpp"), testFile);
    const exe = join(tmp, "test_expressage.exe");
    const c = runProc(GXX, ["-std=c++17", "-O0", "-Wno-return-type", `-I${incDir}`, `-I${GTEST_INC}`, testFile, expCpp, GTEST_LIB, "-o", exe], { cwd: tmp });
    if (!c.ok) return { id: checkId, passed: false, error: c.output };
    const r = runProc(exe, [], { cwd: tmp });
    return { id: checkId, passed: r.ok, error: r.ok ? undefined : r.output, cases: parseGtestCases(r.output) };
  }

  if (checkId === "logistics") {
    const t1 = join(tmp, "test_logistic_sys.cpp");
    const t2 = join(tmp, "test_logistic_sys_edge.cpp");
    patchCppTestFile(join(ds, "blackbox_tests/test_logistic_sys.cpp"), t1);
    patchCppTestFile(join(ds, "blackbox_tests/test_logistic_sys_edge.cpp"), t2);
    const exe = join(tmp, "test_logistics.exe");
    const c = runProc(GXX, ["-std=c++17", "-O0", "-Wno-return-type", `-I${incDir}`, `-I${GTEST_INC}`, t1, t2, accCpp, expCpp, logCpp, GTEST_LIB, "-o", exe], { cwd: tmp });
    if (!c.ok) return { id: checkId, passed: false, error: c.output };
    const r = runProc(exe, [], { cwd: tmp });
    return { id: checkId, passed: r.ok, error: r.ok ? undefined : r.output, cases: parseGtestCases(r.output) };
  }

  if (checkId === "cli") {
    const exe = join(tmp, "logistics_cli.exe");
    const c = runProc(GXX, ["-std=c++17", "-O0", "-Wno-return-type", `-I${incDir}`, accCpp, expCpp, logCpp, mainCpp, "-o", exe], { cwd: tmp });
    if (!c.ok) return { id: checkId, passed: false, error: c.output };
    cpSync(join(ds, "tests/acceptance_tests/account_init.txt"), join(tmp, "data/account.txt"));
    cpSync(join(ds, "tests/acceptance_tests/expressage_init.txt"), join(tmp, "data/expressage.txt"));
    const cases = [];
    let firstError;
    for (const idx of ["000", "001", "002", "003", "004", "005", "006"]) {
      const input = readFileSync(join(ds, `tests/inputs/test${idx}`), "utf8");
      const expected = readFileSync(join(ds, `tests/expected_outputs/test${idx}`), "utf8");
      const r = runProc(exe, [], { cwd: tmp, input });
      let error;
      if (!r.ok) error = `CLI test${idx} failed: ${r.output}`;
      else if (normalizeWs(r.stdout) !== normalizeWs(expected))
        error = `CLI test${idx} output mismatch.\nExpected:\n${expected.slice(0, 300)}\nActual:\n${r.stdout.slice(0, 300)}`;
      cases.push({ name: `cli.test${idx}`, passed: !error });
      firstError ??= error;
    }
    return { id: checkId, passed: !firstError, error: firstError, cases };
  }

  throw new Error(`Unknown C++ check: ${checkId}`);
}

function handleCpp(modeName) {
  return withTempDir("poly-cpp-", (tmp) => {
    const incDir = join(workspaceRoot, "include");
    const sources = ["src/account.cpp", "src/expressage.cpp", "src/logistics.cpp", "src/main.cpp"].map((p) => join(workspaceRoot, p));
    if (modeName === "compile") {
      const exe = join(tmp, "compile_check.exe");
      const c = runProc(GXX, ["-std=c++17", "-O0", "-Wno-return-type", `-I${incDir}`, ...sources, "-o", exe], { cwd: tmp });
      if (!c.ok) {
        console.error(c.output);
        process.exit(1);
      }
      return;
    }
    const allChecks = ["account", "expressage", "logistics", "cli"];
    if (modeName === "external") {
      const results = allChecks.map((id) => runCppCheck(id, tmp));
      console.log(JSON.stringify(results));
      return;
    }
    const targets = modeName === "all" ? allChecks : [modeName];
    for (const id of targets) {
      const res = runCppCheck(id, tmp);
      if (!res.passed) {
        console.error(`[FAIL ${id}] ${res.error || ""}`);
        process.exit(1);
      }
    }
    console.log(`PASS (${targets.join(", ")})`);
  });
}

// ============================================================================
// 2. Java (java/idcenter)
// ============================================================================
const JAVA_CHECK_CLASSES = {
  base62: ["com.sohu.idcenter.Base62Test", "com.sohu.idcenter.Base62BlackboxTest"],
  idworker: ["com.sohu.idcenter.IdWorkerTest", "com.sohu.idcenter.IdWorkerBlackboxTest"],
  sidworker: ["com.sohu.idcenter.SidWorkerTest"],
  cli: ["com.sohu.idcenter.MainTest"],
};

function handleJava(modeName) {
  return withTempDir("poly-java-", (tmp) => {
    const ds = join(DATASETS_ROOT, "java/idcenter");
    const classesDir = join(tmp, "classes");
    mkdirSync(classesDir, { recursive: true });
    const mainSrcDir = join(workspaceRoot, "src/main/java/com/sohu/idcenter");
    const mainJavaFiles = readdirSync(mainSrcDir)
      .filter((f) => f.endsWith(".java"))
      .map((f) => join(mainSrcDir, f));
    const bbDir = join(ds, "blackbox_tests");
    const testJavaFiles = readdirSync(bbDir)
      .filter((f) => f.endsWith(".java"))
      .map((f) => join(bbDir, f));

    const c = runProc(JAVAC, ["-encoding", "UTF-8", "-cp", JUNIT_JAR, "-d", classesDir, ...mainJavaFiles, ...testJavaFiles], { cwd: tmp });
    if (modeName === "compile") {
      if (!c.ok) {
        console.error(c.output);
        process.exit(1);
      }
      return;
    }

    const allChecks = ["base62", "idworker", "sidworker", "cli"];
    const runOne = (id) => {
      if (!c.ok) return { id, passed: false, error: c.output };
      const classArgs = JAVA_CHECK_CLASSES[id].flatMap((cls) => ["-c", cls]);
      const reports = join(tmp, "reports-" + id);
      const r = runProc(JAVA, ["-jar", JUNIT_JAR, "execute", "--class-path", classesDir, "--disable-banner", "--reports-dir", reports, ...classArgs], { cwd: tmp });
      let cases = [];
      try {
        cases = parseJunitXmlCases(reports);
      } catch {}
      return { id, passed: r.ok, error: r.ok ? undefined : r.output, cases };
    };

    if (modeName === "external") {
      console.log(JSON.stringify(allChecks.map(runOne)));
      return;
    }

    const targets = modeName === "all" ? allChecks : [modeName];
    for (const id of targets) {
      const res = runOne(id);
      if (!res.passed) {
        console.error(`[FAIL ${id}] ${res.error || ""}`);
        process.exit(1);
      }
    }
    console.log(`PASS (${targets.join(", ")})`);
  });
}

// ============================================================================
// 3. Python (python/zxcvbn)
// ============================================================================
const PY_CHECK_FILES = {
  matching: ["test_basic.py", "test_user_inputs.py"],
  scoring: ["test_scoring.py"],
  time_estimates: ["test_crack_times.py"],
  feedback: ["test_feedback.py", "test_edge_cases.py"],
};

function handlePython(modeName) {
  return withTempDir("poly-py-", (tmp) => {
    const ds = join(DATASETS_ROOT, "python/zxcvbn");
    const pkgDir = join(workspaceRoot, "zxcvbn");
    const pyFiles = readdirSync(pkgDir)
      .filter((f) => f.endsWith(".py"))
      .map((f) => join(pkgDir, f));

    if (modeName === "compile") {
      const script = "import sys\nfor p in sys.argv[1:]:\n  compile(open(p, 'rb').read(), p, 'exec')\n";
      const c = runProc(PYTHON, ["-I", "-B", "-c", script, ...pyFiles], { cwd: tmp });
      if (!c.ok) {
        console.error(c.output);
        process.exit(1);
      }
      return;
    }

    const allChecks = ["matching", "scoring", "time_estimates", "feedback"];
    const cacheDir = join(tmp, "pytest_cache");
    const junitDir = join(tmp, "junit");
    mkdirSync(junitDir, { recursive: true });
    const runnerCode =
      "import sys; sys.path[:0] = [sys.argv[1], sys.argv[2]]; import pytest; raise SystemExit(pytest.main(sys.argv[3:]))";
    const runOne = (id) => {
      const files = PY_CHECK_FILES[id].map((f) => join(ds, "blackbox_tests", f));
      const r = runProc(
        PYTHON,
        [
          "-I",
          "-B",
          "-c",
          runnerCode,
          workspaceRoot,
          PYTEST_SITE,
          "-q",
          "--tb=short",
          `--junitxml=${join(junitDir, "pytest-" + id + ".xml")}`,
          "-o",
          `cache_dir=${cacheDir}`,
          ...files,
        ],
        { cwd: tmp },
      );
      let cases = [];
      try {
        // Each report holds one check's files, so classnames keep names unique.
        cases = parseJunitXmlCases(junitDir, "pytest-" + id + ".xml");
      } catch {}
      return { id, passed: r.ok, error: r.ok ? undefined : r.output, cases };
    };

    if (modeName === "external") {
      console.log(JSON.stringify(allChecks.map(runOne)));
      return;
    }

    const targets = modeName === "all" ? allChecks : [modeName];
    for (const id of targets) {
      const res = runOne(id);
      if (!res.passed) {
        console.error(`[FAIL ${id}] ${res.error || ""}`);
        process.exit(1);
      }
    }
    console.log(`PASS (${targets.join(", ")})`);
  });
}

// ============================================================================
// 4. JavaScript (javascript/ejs)
// ============================================================================
const MOCHA_TDD_HARNESS = `
const path = require('path');
const tests = [];
const stack = [];
global.suite = (name, fn) => { stack.push(name); try { fn(); } finally { stack.pop(); } };
global.test = (name, fn) => tests.push({ name: [...stack, name].join(' > '), fn });
global.setup = (fn) => fn();
global.teardown = () => {};
for (const file of process.argv.slice(2)) {
  require(path.resolve(file));
}
(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      process.stdout.write('\\n@@CASE PASS ' + JSON.stringify(t.name) + '\\n');
    } catch (err) {
      process.stdout.write('\\n@@CASE FAIL ' + JSON.stringify(t.name) + '\\n');
      failed++;
      console.error('FAIL:', t.name, err && err.stack ? err.stack : err);
    }
  }
  if (failed > 0 || tests.length === 0) process.exit(1);
})();
`;

function handleJs(modeName) {
  return withTempDir("poly-js-", (tmp) => {
    const ds = join(DATASETS_ROOT, "javascript/ejs");
    const jsTargets = ["lib/cjs/utils.js", "lib/cjs/ejs.js", "lib/cjs/parseargs.js", "bin/cli.js"].map((p) => join(workspaceRoot, p));

    if (modeName === "compile") {
      for (const f of jsTargets) {
        const c = runProc(process.execPath, ["--check", f], { cwd: tmp });
        if (!c.ok) {
          console.error(c.output);
          process.exit(1);
        }
      }
      return;
    }

    // Copy workspace and test fixtures into tmp so tests never touch workspaceRoot
    cpSync(workspaceRoot, tmp, { recursive: true });
    mkdirSync(join(tmp, "test"), { recursive: true });
    cpSync(join(ds, "tests/fixtures"), join(tmp, "test/fixtures"), { recursive: true });
    cpSync(join(ds, "tests/utils.js"), join(tmp, "test/utils.js"));
    cpSync(join(ds, "blackbox_tests/render.test.js"), join(tmp, "test/render.test.js"));
    cpSync(join(ds, "blackbox_tests/compile.test.js"), join(tmp, "test/compile.test.js"));
    cpSync(join(ds, "blackbox_tests/advanced.test.js"), join(tmp, "test/advanced.test.js"));
    cpSync(join(__dirname, "ejs_utils_extra_test.js"), join(tmp, "test/utils_extra.test.js"));
    cpSync(join(__dirname, "ejs_cli_extra_test.js"), join(tmp, "test/cli_extra.test.js"));

    // Normalize line-ending comparisons in tests/cli.js for cross-platform execution
    let cliTestCode = readFileSync(join(ds, "tests/cli.js"), "utf8");
    cliTestCode = cliTestCode.replace(
      "let lf = process.platform !== 'win32' ? '\\n' : '\\r\\n';",
      "let lf = '\\n';",
    );
    cliTestCode = cliTestCode.replace(
      "return exec(cmd).toString();",
      "return exec(cmd).toString().replace(/\\r\\n/g, '\\n');",
    );
    cliTestCode = cliTestCode.replaceAll(
      "fs.readFileSync('test/fixtures/rmWhitespace.html', 'utf-8')",
      "fs.readFileSync('test/fixtures/rmWhitespace.html', 'utf-8').replace(/\\r\\n/g, '\\n')",
    );
    cliTestCode = cliTestCode.replaceAll(
      "fs.readFileSync('test/fixtures/include-simple.html', 'utf-8')",
      "fs.readFileSync('test/fixtures/include-simple.html', 'utf-8').replace(/\\r\\n/g, '\\n')",
    );
    writeFileSync(join(tmp, "test/cli.js"), cliTestCode, "utf8");

    const runnerPath = join(tmp, "_runner.cjs");
    writeFileSync(runnerPath, MOCHA_TDD_HARNESS, "utf8");

    const checkMap = {
      utils: [join(tmp, "test/utils.js"), join(tmp, "test/utils_extra.test.js")],
      engine: [join(tmp, "test/render.test.js"), join(tmp, "test/compile.test.js"), join(tmp, "test/advanced.test.js")],
      cli: [join(tmp, "test/cli.js"), join(tmp, "test/cli_extra.test.js")],
    };
    const allChecks = ["utils", "engine", "cli"];
    const runOne = (id) => {
      const r = runProc(process.execPath, [runnerPath, ...checkMap[id]], { cwd: tmp });
      const cases = [];
      for (const line of r.stdout.split(/\r?\n/)) {
        const m = /^@@CASE (PASS|FAIL) (".*")$/.exec(line);
        if (m) cases.push({ name: `${id}: ${JSON.parse(m[2])}`, passed: m[1] === "PASS" });
      }
      return { id, passed: r.ok, error: r.ok ? undefined : r.output, cases: mergeCases(cases) };
    };

    if (modeName === "external") {
      console.log(JSON.stringify(allChecks.map(runOne)));
      return;
    }

    const targets = modeName === "all" ? allChecks : [modeName];
    for (const id of targets) {
      const res = runOne(id);
      if (!res.passed) {
        console.error(`[FAIL ${id}] ${res.error || ""}`);
        process.exit(1);
      }
    }
    console.log(`PASS (${targets.join(", ")})`);
  });
}

// ============================================================================
// 5. Go (go/gobreaker)
// ============================================================================
const GO_ASSERT_STUB = `package assert

import (
\t"reflect"
\t"testing"
)

func isNil(v any) bool {
\tif v == nil {
\t\treturn true
\t}
\trv := reflect.ValueOf(v)
\tswitch rv.Kind() {
\tcase reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Ptr, reflect.Slice:
\t\treturn rv.IsNil()
\t}
\treturn false
}

func Equal(t *testing.T, expected, actual any, _ ...any) bool {
\tt.Helper()
\tif !reflect.DeepEqual(expected, actual) {
\t\tt.Errorf("Not equal:\\nexpected: %#v\\nactual  : %#v", expected, actual)
\t\treturn false
\t}
\treturn true
}

func Nil(t *testing.T, obj any, _ ...any) bool {
\tt.Helper()
\tif !isNil(obj) {
\t\tt.Errorf("Expected nil, got: %#v", obj)
\t\treturn false
\t}
\treturn true
}

func NotNil(t *testing.T, obj any, _ ...any) bool {
\tt.Helper()
\tif isNil(obj) {
\t\tt.Errorf("Expected non-nil")
\t\treturn false
\t}
\treturn true
}

func NoError(t *testing.T, err error, _ ...any) bool {
\tt.Helper()
\tif err != nil {
\t\tt.Errorf("Unexpected error: %v", err)
\t\treturn false
\t}
\treturn true
}

func Error(t *testing.T, err error, _ ...any) bool {
\tt.Helper()
\tif err == nil {
\t\tt.Errorf("Expected error, got nil")
\t\treturn false
\t}
\treturn true
}

func True(t *testing.T, value bool, _ ...any) bool {
\tt.Helper()
\tif !value {
\t\tt.Errorf("Expected true, got false")
\t\treturn false
\t}
\treturn true
}

func False(t *testing.T, value bool, _ ...any) bool {
\tt.Helper()
\tif value {
\t\tt.Errorf("Expected false, got true")
\t\treturn false
\t}
\treturn true
}

func Greater(t *testing.T, e1, e2 any, _ ...any) bool {
\tt.Helper()
\tv1 := reflect.ValueOf(e1)
\tv2 := reflect.ValueOf(e2)
\tif v1.Kind() == reflect.Int && v2.Kind() == reflect.Int {
\t\tif v1.Int() > v2.Int() {
\t\t\treturn true
\t\t}
\t}
\tt.Errorf("Expected %v > %v", e1, e2)
\treturn false
}

func Panics(t *testing.T, fn func(), _ ...any) bool {
\tt.Helper()
\tdefer func() {
\t\tif r := recover(); r == nil {
\t\t\tt.Errorf("Expected panic, but did not panic")
\t\t}
\t}()
\tfn()
\treturn true
}
`;

function handleGo(modeName) {
  return withTempDir("poly-go-", (tmp) => {
    const ds = join(DATASETS_ROOT, "go/gobreaker");
    cpSync(workspaceRoot, tmp, { recursive: true });
    // Remove bench_checks and refs so only v2 package is tested cleanly
    rmSync(join(tmp, "bench_checks"), { recursive: true, force: true });
    rmSync(join(tmp, "refs"), { recursive: true, force: true });

    // Set up offline local testify/assert stub in tmp/_testify
    const testifyDir = join(tmp, "_testify/assert");
    mkdirSync(testifyDir, { recursive: true });
    writeFileSync(join(tmp, "_testify/go.mod"), "module github.com/stretchr/testify\n\ngo 1.22\n", "utf8");
    writeFileSync(join(testifyDir, "assert.go"), GO_ASSERT_STUB, "utf8");

    const v2Dir = join(tmp, "v2");
    writeFileSync(
      join(v2Dir, "go.mod"),
      [
        "module github.com/sony/gobreaker/v2",
        "",
        "go 1.22",
        "",
        "require github.com/stretchr/testify v1.8.4",
        "",
        "replace github.com/stretchr/testify => ../_testify",
        "",
      ].join("\n"),
      "utf8",
    );
    rmSync(join(v2Dir, "go.sum"), { force: true });

    const goCacheDir = join(TOOLS_ROOT, "gocache");
    mkdirSync(goCacheDir, { recursive: true });
    const goEnv = {
      GOPROXY: "off",
      GOSUMDB: "off",
      GOCACHE: goCacheDir,
    };

    if (modeName === "compile") {
      const c = runProc(GO_BIN, ["build", "."], { cwd: v2Dir, env: goEnv });
      if (!c.ok) {
        console.error(c.output);
        process.exit(1);
      }
      return;
    }

    // Module-isolated testing configuration so upstream modules don't break on downstream hollows
    const checkConfigs = {
      counter: {
        sources: ["counter.go"],
        tests: [
          join(ds, "tests/v2/counter_test.go"),
          join(__dirname, "gobreaker_counter_extra_test.go"),
        ],
      },
      breaker: {
        sources: ["counter.go", "gobreaker.go"],
        tests: [
          join(ds, "tests/v2/gobreaker_test.go"),
        ],
        pattern: "^(TestStateConstants|TestNewCircuitBreaker|TestDefaultCircuitBreaker|TestCustomCircuitBreaker|TestPanicInRequest|TestGeneration|TestCustomIsSuccessful|TestIsExcludedAndIsSuccessfulCombination)$",
      },
      twostep: {
        sources: ["counter.go", "gobreaker.go", "twostep_gobreaker.go"],
        tests: [
          join(__dirname, "gobreaker_test_helpers.go"),
          join(ds, "tests/v2/twostep_gobreaker_test.go"),
          join(__dirname, "gobreaker_twostep_extra_test.go"),
        ],
      },
      distributed: {
        sources: ["counter.go", "gobreaker.go", "distributed_gobreaker.go"],
        tests: [
          join(__dirname, "gobreaker_test_helpers.go"),
          join(ds, "tests/v2/distributed_gobreaker_test.go"),
        ],
      },
    };

    const allChecks = ["counter", "breaker", "twostep", "distributed"];
    const runOne = (id) => {
      const targetDir = join(tmp, "target_" + id);
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(
        join(targetDir, "go.mod"),
        [
          "module github.com/sony/gobreaker/v2",
          "",
          "go 1.22",
          "",
          "require github.com/stretchr/testify v1.8.4",
          "",
          "replace github.com/stretchr/testify => ../_testify",
          "",
        ].join("\n"),
        "utf8",
      );

      const cfg = checkConfigs[id];
      for (const s of cfg.sources) {
        const srcPath = join(v2Dir, s);
        if (existsSync(srcPath)) {
          cpSync(srcPath, join(targetDir, s));
        }
      }
      for (const t of cfg.tests) {
        if (existsSync(t)) {
          cpSync(t, join(targetDir, basename(t)));
        }
      }

      const testArgs = ["test", "-json", "-count=1"];
      if (cfg.pattern) testArgs.push("-run", cfg.pattern);
      testArgs.push(".");

      const r = runProc(GO_BIN, testArgs, {
        cwd: targetDir,
        env: goEnv,
        timeout: 90_000,
      });
      return { id, passed: r.ok, error: r.ok ? undefined : r.output, cases: parseGoCases(r.stdout) };
    };

    if (modeName === "external") {
      console.log(JSON.stringify(allChecks.map(runOne)));
      return;
    }

    const targets = modeName === "all" ? allChecks : [modeName];
    for (const id of targets) {
      const res = runOne(id);
      if (!res.passed) {
        console.error(`[FAIL ${id}] ${res.error || ""}`);
        process.exit(1);
      }
    }
    console.log(`PASS (${targets.join(", ")})`);
  });
}

if (taskId.startsWith("poly-cpp-")) handleCpp(mode);
else if (taskId.startsWith("poly-java-")) handleJava(mode);
else if (taskId.startsWith("poly-py-")) handlePython(mode);
else if (taskId.startsWith("poly-js-")) handleJs(mode);
else if (taskId.startsWith("poly-go-")) handleGo(mode);
else {
  console.error(`Unknown task prefix: ${taskId}`);
  process.exit(1);
}
