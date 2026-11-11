import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Command, RealFixture } from "../real-projects/types.ts";

const execute = promisify(execFile);
const local = (name: string) =>
  fileURLToPath(new URL("./assets/" + name, import.meta.url));
const pythonExe = "C:\\Users\\chiparon\\miniconda3\\python.exe";

const isRefSource = (p: string) =>
  p.startsWith("refs/") && /\.(c|h|cpp|hpp|cs|java|py|js|ts|go)$/.test(p);

export const crossLanguageTruthRefs: Record<string, string[]> = {
  "poly-cpp-logistics-l1": [
    "refs/python/logistics_account_expressage_ref.py",
    "refs/python/logistics_sys_service_ref.py",
    "refs/java/LogisticsCliLoopRef.java",
  ],
  "poly-cpp-logistics-l2": [
    "refs/python/logistics_account_expressage_ref.py",
    "refs/python/logistics_sys_service_ref.py",
    "refs/java/LogisticsCliLoopRef.java",
  ],
  "poly-java-idcenter-l1": [
    "refs/go/base62_codec_ref.go",
    "refs/go/snowflake_idworker_ref.go",
    "refs/python/sidworker_and_cli_ref.py",
  ],
  "poly-java-idcenter-l2": [
    "refs/go/base62_codec_ref.go",
    "refs/go/snowflake_idworker_ref.go",
    "refs/python/sidworker_and_cli_ref.py",
  ],
  "poly-py-zxcvbn-l1": [
    "refs/js/zxcvbn_time_estimates_ref.js",
    "refs/js/zxcvbn_feedback_ref.js",
    "refs/go/zxcvbn_matching_scoring_ref.go",
  ],
  "poly-py-zxcvbn-l2": [
    "refs/js/zxcvbn_time_estimates_ref.js",
    "refs/js/zxcvbn_feedback_ref.js",
    "refs/go/zxcvbn_matching_scoring_ref.go",
  ],
  "poly-js-ejs-l1": [
    "refs/python/ejs_utils_ref.py",
    "refs/go/ejs_cli_and_compiler_ref.go",
  ],
  "poly-js-ejs-l2": [
    "refs/python/ejs_utils_ref.py",
    "refs/go/ejs_cli_and_compiler_ref.go",
  ],
  "poly-go-gobreaker-l1": [
    "refs/java/RollingCountsRef.java",
    "refs/python/distributed_gobreaker_ref.py",
  ],
  "poly-go-gobreaker-l2": [
    "refs/java/RollingCountsRef.java",
    "refs/python/distributed_gobreaker_ref.py",
  ],
};

function polyFixture(opts: {
  id: string;
  title: string;
  upstream: { url: string; commit: string };
  requirement: string;
  modules: RealFixture["modules"];
  references: string[];
  checkCount: number;
  productionFiles: (path: string) => boolean;
}): RealFixture {
  const command = (mode: string): Command => ({
    executable: process.execPath,
    args: [local("driver.mjs"), opts.id, mode],
    timeoutMs: 120_000,
  });
  const crossRefs = crossLanguageTruthRefs[opts.id] ?? [];
  const scopedCompile = opts.id.startsWith("poly-py-") || opts.id.startsWith("poly-go-");
  return {
    id: opts.id,
    title: opts.title,
    upstream: opts.upstream,
    modules: opts.modules,
    references: [...new Set([...opts.references, ...crossRefs])],
    requirement:
      opts.requirement +
      "\n\nWritable modules in topological order:\n" +
      opts.modules.map((m) => `- ${m.path}: ${m.description}`).join("\n") +
      "\n\nConsult SPEC.md for the complete PolyCodeEval Product Requirements Document (PRD), and inspect the local project headers/modules as well as the cross-language reference implementations under refs/ for shared algorithms, data structures, and wire formats. Only the listed writable modules may be modified.",
    compile: command("compile"),
    ...(scopedCompile && {
      moduleCompiles: Object.fromEntries(opts.modules.map((m) => [m.name, command("compile-" + m.name)])),
    }),
    test: command("all"),
    moduleTests: Object.fromEntries(
      opts.modules.map((m) => [m.name, command(m.name)]),
    ),
    async prepare(root, variant) {
      await execute(pythonExe, [local("prepare.py"), root, opts.id, variant], {
        timeout: 180_000,
        windowsHide: true,
      });
    },
    async grade(root) {
      const { stdout } = await execute(
        process.execPath,
        command("external").args,
        {
          cwd: root,
          timeout: 180_000,
          windowsHide: true,
        },
      );
      const checks = JSON.parse(stdout);
      if (checks.length !== opts.checkCount) {
        throw Error(
          `Incomplete ${opts.id} external grade: expected ${opts.checkCount}, got ${checks.length}`,
        );
      }
      return checks;
    },
    productionFiles: (p) => isRefSource(p) || opts.productionFiles(p),
  };
}

const cppUpstream = {
  url: "https://github.com/PolyCodeEval/PolyCodeEval.git#cpp/logistic_system",
  commit: "polycodeeval-v1-cpp-logistic_system",
};
const javaUpstream = {
  url: "https://github.com/PolyCodeEval/PolyCodeEval.git#java/idcenter",
  commit: "polycodeeval-v1-java-idcenter",
};
const pyUpstream = {
  url: "https://github.com/PolyCodeEval/PolyCodeEval.git#python/zxcvbn",
  commit: "polycodeeval-v1-python-zxcvbn",
};
const jsUpstream = {
  url: "https://github.com/PolyCodeEval/PolyCodeEval.git#javascript/ejs",
  commit: "polycodeeval-v1-javascript-ejs",
};
const goUpstream = {
  url: "https://github.com/PolyCodeEval/PolyCodeEval.git#go/gobreaker",
  commit: "polycodeeval-v1-go-gobreaker",
};

export const fixtures: RealFixture[] = [
  // ==========================================================================
  // 1. C++: cpp/logistic_system (L1 & L2)
  // ==========================================================================
  polyFixture({
    id: "poly-cpp-logistics-l1",
    title: "C++ Logistics Management System (L1 Full Skeleton)",
    upstream: cppUpstream,
    requirement:
      "Implement the complete C++17 Logistics Management System from its hollowed project skeleton according to SPEC.md and the class declarations in include/*.h.",
    modules: [
      {
        name: "account",
        path: "src/account.cpp",
        language: "C++",
        description:
          "Implement AccountNode default and parameterized constructors and stream formatting declared in include/account.h.",
      },
      {
        name: "expressage",
        path: "src/expressage.cpp",
        language: "C++",
        dependsOn: ["account"],
        description:
          "Implement ExpressageNode constructors, parcel Sign(time) state transition, and stream output operator declared in include/expressage.h.",
      },
      {
        name: "logistics",
        path: "src/logistics.cpp",
        language: "C++",
        dependsOn: ["account", "expressage"],
        description:
          "Implement LogisticSys file persistence (init/save/destructor), account registration/login/password/balance management, and parcel assignment (15-unit fee from sender to root, KD8-digit ID), signing, and role-aware queries.",
      },
      {
        name: "cli",
        path: "src/main.cpp",
        language: "C++",
        dependsOn: ["logistics"],
        description:
          "Implement the interactive terminal command loop before login (reg, login, exit, invalid op) and after login (cpwd, send, sign, qm, recharge, qall, qalls, qallr, qs, qr, qt, q, exit) per SPEC.md.",
      },
    ],
    references: [
      "include/account.h",
      "include/expressage.h",
      "include/logistics.h",
      "bench_checks/public_smoke.cpp",
    ],
    checkCount: 4,
    productionFiles: (p) =>
      (p.startsWith("include/") ||
        p.startsWith("src/") ||
        p.startsWith("bench_checks/")) &&
      /\.(h|hpp|c|cpp)$/.test(p),
  }),

  polyFixture({
    id: "poly-cpp-logistics-l2",
    title: "C++ Logistics Management System (L2 Core Domain Slice)",
    upstream: cppUpstream,
    requirement:
      "Implement the parcel node and core logistics service modules (src/expressage.cpp and src/logistics.cpp) while integrating with the existing account entity (src/account.cpp) and CLI entry point (src/main.cpp).",
    modules: [
      {
        name: "expressage",
        path: "src/expressage.cpp",
        language: "C++",
        description:
          "Implement ExpressageNode constructors and Sign(time) status transition declared in include/expressage.h.",
      },
      {
        name: "logistics",
        path: "src/logistics.cpp",
        language: "C++",
        dependsOn: ["expressage"],
        description:
          "Implement LogisticSys persistence, authentication, balance operations, parcel dispatch (15-unit fee to root, KD8-digit ID), parcel signing, and query methods.",
      },
    ],
    references: [
      "include/account.h",
      "include/expressage.h",
      "include/logistics.h",
      "src/account.cpp",
      "src/main.cpp",
      "bench_checks/public_smoke.cpp",
    ],
    checkCount: 4,
    productionFiles: (p) =>
      (p.startsWith("include/") ||
        p.startsWith("src/") ||
        p.startsWith("bench_checks/")) &&
      /\.(h|hpp|c|cpp)$/.test(p),
  }),

  // ==========================================================================
  // 2. Java: java/idcenter (L1 & L2)
  // ==========================================================================
  polyFixture({
    id: "poly-java-idcenter-l1",
    title: "Java Distributed ID & Base62 Suite (L1 Full Skeleton)",
    upstream: javaUpstream,
    requirement:
      "Implement the complete idcenter Java library and CLI entry point from its hollowed project skeleton according to SPEC.md.",
    modules: [
      {
        name: "base62",
        path: "src/main/java/com/sohu/idcenter/Base62.java",
        language: "Java",
        description:
          "Implement Base62.encode(long), Base62.decode(String), and getIndex(String, int) using the 62-char alphanumeric alphabet and throwing IllegalArgumentException on negative numbers or invalid characters.",
      },
      {
        name: "idworker",
        path: "src/main/java/com/sohu/idcenter/IdWorker.java",
        language: "Java",
        description:
          "Implement Snowflake-style IdWorker constructors (validating workerId/datacenterId in [0,31] and idepoch < current time), getId(), getIdTimestamp(long), nextId(), tilNextMillis(long), and timeGen().",
      },
      {
        name: "sidworker",
        path: "src/main/java/com/sohu/idcenter/SidWorker.java",
        language: "Java",
        description:
          "Implement synchronized 19-digit timestamp ID generator SidWorker.nextSid(), tilNextMillis(long), and timeGen() using yyyyMMddHHmmssSSS * 100 + sequence.",
      },
      {
        name: "cli",
        path: "src/main/java/com/sohu/idcenter/Main.java",
        language: "Java",
        dependsOn: ["idworker", "sidworker"],
        description:
          "Implement Main.main(String[] args) supporting 'idworker <num> <output>' and 'sidworker <num> <output>' subcommands and printing usage guidance to stderr on invalid arguments.",
      },
    ],
    references: ["bench_checks/PublicSmoke.java"],
    checkCount: 4,
    productionFiles: (p) =>
      (p.startsWith("src/main/java/") || p.startsWith("bench_checks/")) &&
      p.endsWith(".java"),
  }),

  polyFixture({
    id: "poly-java-idcenter-l2",
    title: "Java Distributed ID & Base62 Suite (L2 Core Codec & Snowflake Slice)",
    upstream: javaUpstream,
    requirement:
      "Implement the Base62 codec and Snowflake IdWorker modules while integrating with the existing SidWorker and Main CLI modules.",
    modules: [
      {
        name: "base62",
        path: "src/main/java/com/sohu/idcenter/Base62.java",
        language: "Java",
        description:
          "Implement Base62.encode(long), Base62.decode(String), and getIndex(String, int) with strict input validation.",
      },
      {
        name: "idworker",
        path: "src/main/java/com/sohu/idcenter/IdWorker.java",
        language: "Java",
        description:
          "Implement Snowflake-style IdWorker constructors, bit-shifted 64-bit ID generation, clock-wait tilNextMillis, and getIdTimestamp extraction.",
      },
    ],
    references: [
      "src/main/java/com/sohu/idcenter/SidWorker.java",
      "src/main/java/com/sohu/idcenter/Main.java",
      "bench_checks/PublicSmoke.java",
    ],
    checkCount: 4,
    productionFiles: (p) =>
      (p.startsWith("src/main/java/") || p.startsWith("bench_checks/")) &&
      p.endsWith(".java"),
  }),

  // ==========================================================================
  // 3. Python: python/zxcvbn (L1 & L2)
  // ==========================================================================
  polyFixture({
    id: "poly-py-zxcvbn-l1",
    title: "Python zxcvbn Password Strength Estimator (L1 Full Pipeline)",
    upstream: pyUpstream,
    requirement:
      "Implement the complete 4-stage zxcvbn password strength analysis pipeline (omnimatch pattern detection, minimum-guess DP scoring, attack time estimation, and user feedback generation) according to SPEC.md.",
    modules: [
      {
        name: "scoring",
        path: "zxcvbn/scoring.py",
        language: "Python",
        description:
          "Implement most_guessable_match_sequence dynamic programming search and pattern guess estimators (dictionary, uppercase, l33t, spatial, repeat, sequence, regex, date, bruteforce).",
      },
      {
        name: "matching",
        path: "zxcvbn/matching.py",
        language: "Python",
        dependsOn: ["scoring"],
        description:
          "Implement omnimatch and all pattern matchers (dictionary, reverse_dictionary, l33t, spatial, repeat, sequence, regex, date) using adjacency_graphs and frequency_lists.",
      },
      {
        name: "time_estimates",
        path: "zxcvbn/time_estimates.py",
        language: "Python",
        dependsOn: ["scoring"],
        description:
          "Implement estimate_attack_times, guesses_to_score (0..4), display_time formatting, and float_to_decimal conversion.",
      },
      {
        name: "feedback",
        path: "zxcvbn/feedback.py",
        language: "Python",
        dependsOn: ["scoring"],
        description:
          "Implement get_feedback, get_match_feedback, and get_dictionary_match_feedback returning structured warning and suggestions.",
      },
    ],
    references: [
      "zxcvbn/__init__.py",
      "zxcvbn/__main__.py",
      "zxcvbn/adjacency_graphs.py",
      "bench_checks/public_smoke.py",
    ],
    checkCount: 4,
    productionFiles: (p) =>
      (p.startsWith("zxcvbn/") || p.startsWith("bench_checks/")) &&
      p.endsWith(".py"),
  }),

  polyFixture({
    id: "poly-py-zxcvbn-l2",
    title: "Python zxcvbn Password Strength Estimator (L2 Time Estimates & Feedback Slice)",
    upstream: pyUpstream,
    requirement:
      "Implement the downstream attack-time estimation and actionable feedback modules (zxcvbn/time_estimates.py and zxcvbn/feedback.py) consuming match sequences produced by zxcvbn/matching.py and zxcvbn/scoring.py.",
    modules: [
      {
        name: "time_estimates",
        path: "zxcvbn/time_estimates.py",
        language: "Python",
        description:
          "Implement estimate_attack_times (online throttled/unthrottled and offline slow/fast hashing scenarios), guesses_to_score, display_time, and float_to_decimal.",
      },
      {
        name: "feedback",
        path: "zxcvbn/feedback.py",
        language: "Python",
        description:
          "Implement get_feedback, get_match_feedback, and get_dictionary_match_feedback for dictionary, spatial, repeat, sequence, regex, and date matches.",
      },
    ],
    references: [
      "zxcvbn/__init__.py",
      "zxcvbn/matching.py",
      "zxcvbn/scoring.py",
      "zxcvbn/adjacency_graphs.py",
      "bench_checks/public_smoke.py",
    ],
    checkCount: 4,
    productionFiles: (p) =>
      (p.startsWith("zxcvbn/") || p.startsWith("bench_checks/")) &&
      p.endsWith(".py"),
  }),

  // ==========================================================================
  // 4. JavaScript: javascript/ejs (L1 & L2)
  // ==========================================================================
  polyFixture({
    id: "poly-js-ejs-l1",
    title: "JavaScript EJS Template Compiler & CLI (L1 Full Skeleton)",
    upstream: jsUpstream,
    requirement:
      "Implement the complete CommonJS EJS template utility module, template compiler/renderer engine, and CLI runner according to SPEC.md.",
    modules: [
      {
        name: "utils",
        path: "lib/cjs/utils.js",
        language: "JavaScript",
        description:
          "Implement escapeRegExpChars, escapeXML, escapeXMLToString, shallowCopy, shallowCopyFromList, cache (set/get/remove/reset), and hyphenToCamel.",
      },
      {
        name: "engine",
        path: "lib/cjs/ejs.js",
        language: "JavaScript",
        dependsOn: ["utils"],
        description:
          "Implement Template compilation/parsing/source generation, compile, render, renderFile, include resolution, caching, clearCache, and __express.",
      },
      {
        name: "cli",
        path: "bin/cli.js",
        language: "JavaScript",
        dependsOn: ["engine", "utils"],
        description:
          "Implement the CLI runner parsing options via lib/cjs/parseargs.js, loading data from -f/-i/stdin/key=val args, converting hyphenated flags via hyphenToCamel, and rendering templates.",
      },
    ],
    references: [
      "lib/cjs/parseargs.js",
      "examples/functions.js",
      "examples/list.js",
      "bench_checks/public_smoke.js",
    ],
    checkCount: 3,
    productionFiles: (p) =>
      (p.startsWith("lib/cjs/") ||
        p.startsWith("bin/") ||
        p.startsWith("examples/") ||
        p.startsWith("bench_checks/")) &&
      p.endsWith(".js"),
  }),

  polyFixture({
    id: "poly-js-ejs-l2",
    title: "JavaScript EJS Template Compiler & CLI (L2 Core Runtime & Compiler Slice)",
    upstream: jsUpstream,
    requirement:
      "Implement the EJS utility helpers (lib/cjs/utils.js) and template compiler/renderer engine (lib/cjs/ejs.js) so that both programmatic API callers and the existing CLI (bin/cli.js) pass all checks.",
    modules: [
      {
        name: "utils",
        path: "lib/cjs/utils.js",
        language: "JavaScript",
        description:
          "Implement escapeRegExpChars, escapeXML, shallowCopy, shallowCopyFromList, in-memory LRU/object cache, and hyphenToCamel.",
      },
      {
        name: "engine",
        path: "lib/cjs/ejs.js",
        language: "JavaScript",
        dependsOn: ["utils"],
        description:
          "Implement Template class (createRegex, compile, generateSource, parseTemplateText, scanLine), compile, render, renderFile, clearCache, and __express.",
      },
    ],
    references: [
      "bin/cli.js",
      "lib/cjs/parseargs.js",
      "examples/functions.js",
      "examples/list.js",
      "bench_checks/public_smoke.js",
    ],
    checkCount: 3,
    productionFiles: (p) =>
      (p.startsWith("lib/cjs/") ||
        p.startsWith("bin/") ||
        p.startsWith("examples/") ||
        p.startsWith("bench_checks/")) &&
      p.endsWith(".js"),
  }),

  // ==========================================================================
  // 5. Go: go/gobreaker (L1 & L2)
  // ==========================================================================
  polyFixture({
    id: "poly-go-gobreaker-l1",
    title: "Go Generic & Distributed Circuit Breaker v2 (L1 Full Package)",
    upstream: goUpstream,
    requirement:
      "Implement the complete v2 generic CircuitBreaker, rolling window counter, TwoStepCircuitBreaker, and DistributedCircuitBreaker in package gobreaker according to SPEC.md and the v1 reference implementation.",
    modules: [
      {
        name: "counter",
        path: "v2/counter.go",
        language: "Go",
        description:
          "Implement Counts and rollingCounts (newRollingCounts, index, current, onRequest, onSuccess, onFailure, onExclusion, validRequests, clear, roll, subtract, grow, bucketAt).",
      },
      {
        name: "breaker",
        path: "v2/gobreaker.go",
        language: "Go",
        dependsOn: ["counter"],
        description:
          "Implement generic CircuitBreaker[T] (NewCircuitBreaker, Name, State, Counts, Metrics, Execute, beforeRequest, afterRequest, onSuccess, onFailure, currentState, setState, toNewGeneration).",
      },
      {
        name: "twostep",
        path: "v2/twostep_gobreaker.go",
        language: "Go",
        dependsOn: ["breaker"],
        description:
          "Implement generic TwoStepCircuitBreaker[T] (NewTwoStepCircuitBreaker, Name, State, Counts, Metrics, Allow).",
      },
      {
        name: "distributed",
        path: "v2/distributed_gobreaker.go",
        language: "Go",
        dependsOn: ["breaker"],
        description:
          "Implement generic DistributedCircuitBreaker[T] synchronized via SharedDataStore (NewDistributedCircuitBreaker, getSharedState, setSharedState, withLock, State, Execute, beforeRequest, afterRequest).",
      },
    ],
    references: [
      "gobreaker.go",
      "example/http_breaker.go",
      "v2/example/http_breaker.go",
      "v2/redis/store.go",
      "bench_checks/public_smoke.go",
    ],
    checkCount: 4,
    productionFiles: (p) =>
      p.endsWith(".go") && !p.endsWith("_test.go"),
  }),

  polyFixture({
    id: "poly-go-gobreaker-l2",
    title: "Go Generic & Distributed Circuit Breaker v2 (L2 Rolling Counter & Distributed Breaker Slice)",
    upstream: goUpstream,
    requirement:
      "Implement the rolling window counter (v2/counter.go) and distributed circuit breaker (v2/distributed_gobreaker.go) while integrating with the existing generic CircuitBreaker[T] (v2/gobreaker.go) and TwoStepCircuitBreaker[T] (v2/twostep_gobreaker.go).",
    modules: [
      {
        name: "counter",
        path: "v2/counter.go",
        language: "Go",
        description:
          "Implement Counts and rollingCounts bucket rotation, request/success/failure/exclusion accounting, and window subtraction.",
      },
      {
        name: "distributed",
        path: "v2/distributed_gobreaker.go",
        language: "Go",
        dependsOn: ["counter"],
        description:
          "Implement DistributedCircuitBreaker[T] state persistence, distributed mutex locking via SharedDataStore, and synchronized request execution.",
      },
    ],
    references: [
      "v2/gobreaker.go",
      "v2/twostep_gobreaker.go",
      "gobreaker.go",
      "v2/redis/store.go",
      "bench_checks/public_smoke.go",
    ],
    checkCount: 4,
    productionFiles: (p) =>
      p.endsWith(".go") && !p.endsWith("_test.go"),
  }),
];
