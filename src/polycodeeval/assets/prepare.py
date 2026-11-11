import hashlib
import json
import zipfile
import shutil
import sys
from pathlib import Path
from cross_lang_refs import write_cross_language_refs

BENCH_ROOT = Path(__file__).resolve().parents[3]
DATASETS_ROOT = BENCH_ROOT / "work" / "polycodeeval-upstream" / "datasets"

TASK_CONFIG = {
    "poly-cpp-logistics-l1": {
        "lang": "cpp",
        "project": "logistic_system",
        "l1_dir": "L1_logistic_system",
        "writable": {
            "src/account.cpp": "account.cpp",
            "src/expressage.cpp": "expressage.cpp",
            "src/logistics.cpp": "logistics.cpp",
            "src/main.cpp": "main.cpp",
        },
    },
    "poly-cpp-logistics-l2": {
        "lang": "cpp",
        "project": "logistic_system",
        "l1_dir": "L1_logistic_system",
        "writable": {
            "src/expressage.cpp": "expressage.cpp",
            "src/logistics.cpp": "logistics.cpp",
        },
    },
    "poly-java-idcenter-l1": {
        "lang": "java",
        "project": "idcenter",
        "l1_dir": "L1_idcenter",
        "writable": {
            "src/main/java/com/sohu/idcenter/Base62.java": "com/sohu/idcenter/Base62.java",
            "src/main/java/com/sohu/idcenter/IdWorker.java": "com/sohu/idcenter/IdWorker.java",
            "src/main/java/com/sohu/idcenter/SidWorker.java": "com/sohu/idcenter/SidWorker.java",
            "src/main/java/com/sohu/idcenter/Main.java": "com/sohu/idcenter/Main.java",
        },
    },
    "poly-java-idcenter-l2": {
        "lang": "java",
        "project": "idcenter",
        "l1_dir": "L1_idcenter",
        "writable": {
            "src/main/java/com/sohu/idcenter/Base62.java": "com/sohu/idcenter/Base62.java",
            "src/main/java/com/sohu/idcenter/IdWorker.java": "com/sohu/idcenter/IdWorker.java",
        },
    },
    "poly-py-zxcvbn-l1": {
        "lang": "python",
        "project": "zxcvbn",
        "l1_dir": "L1_zxcvbn",
        "writable": {
            "zxcvbn/matching.py": "matching.py",
            "zxcvbn/scoring.py": "scoring.py",
            "zxcvbn/time_estimates.py": "time_estimates.py",
            "zxcvbn/feedback.py": "feedback.py",
        },
    },
    "poly-py-zxcvbn-l2": {
        "lang": "python",
        "project": "zxcvbn",
        "l1_dir": "L1_zxcvbn",
        "writable": {
            "zxcvbn/time_estimates.py": "time_estimates.py",
            "zxcvbn/feedback.py": "feedback.py",
        },
    },
    "poly-js-ejs-l1": {
        "lang": "javascript",
        "project": "ejs",
        "l1_dir": "L1_ejs",
        "writable": {
            "lib/cjs/utils.js": "lib/cjs/utils.js",
            "lib/cjs/ejs.js": "lib/cjs/ejs.js",
            "bin/cli.js": "bin/cli.js",
        },
    },
    "poly-js-ejs-l2": {
        "lang": "javascript",
        "project": "ejs",
        "l1_dir": "L1_ejs",
        "writable": {
            "lib/cjs/utils.js": "lib/cjs/utils.js",
            "lib/cjs/ejs.js": "lib/cjs/ejs.js",
        },
    },
    "poly-go-gobreaker-l1": {
        "lang": "go",
        "project": "gobreaker",
        "l1_dir": "L1_gobreaker",
        "writable": {
            "v2/counter.go": "v2/counter.go",
            "v2/gobreaker.go": "v2/gobreaker.go",
            "v2/twostep_gobreaker.go": "v2/twostep_gobreaker.go",
            "v2/distributed_gobreaker.go": "v2/distributed_gobreaker.go",
        },
    },
    "poly-go-gobreaker-l2": {
        "lang": "go",
        "project": "gobreaker",
        "l1_dir": "L1_gobreaker",
        "writable": {
            "v2/counter.go": "v2/counter.go",
            "v2/distributed_gobreaker.go": "v2/distributed_gobreaker.go",
        },
    },
}

PUBLIC_SMOKE = {
    "cpp": (
        "bench_checks/public_smoke.cpp",
        """// Public smoke reference for LogisticSys, AccountNode, and ExpressageNode
#include "../include/logistics.h"
#include <cassert>
#include <sstream>

int main() {
    AccountNode acc("u1", "pw", "Alice", "12345", 50.0, "Addr", authority::user);
    assert(acc.id == "u1" && acc.money == 50.0);
    ExpressageNode exp("KD00000001", "u1", "u2", "2020-01-01", "NULL", "Note", false);
    assert(!exp.Flag);
    assert(exp.Sign("2020-01-02"));
    assert(exp.Flag && exp.signTime == "2020-01-02");
    return 0;
}
""",
    ),
    "java": (
        "bench_checks/PublicSmoke.java",
        """package com.sohu.idcenter;

/**
 * Public smoke reference for Base62, IdWorker, SidWorker, and Main CLI.
 * Also provides reference patterns for timestamp/sequence handling.
 */
public class PublicSmoke {
    public static void verifySmoke() {
        String encoded = Base62.encode(62L);
        if (!"10".equals(encoded) || Base62.decode(encoded) != 62L) {
            throw new AssertionError("Base62 round-trip mismatch");
        }
        long epoch = System.currentTimeMillis() - 3600_000L;
        IdWorker worker = new IdWorker(1L, 1L, 0L, epoch);
        long id1 = worker.getId();
        long id2 = worker.getId();
        if (id1 <= 0 || id2 <= id1 || worker.getIdTimestamp(id1) < epoch) {
            throw new AssertionError("IdWorker monotonic/timestamp check failed");
        }
        long sid = SidWorker.nextSid();
        if (String.valueOf(sid).length() != 19) {
            throw new AssertionError("SidWorker 19-digit format check failed");
        }
    }
}
""",
    ),
    "python": (
        "bench_checks/public_smoke.py",
        """from zxcvbn import zxcvbn

def run_public_smoke():
    weak = zxcvbn("password")
    assert weak["score"] == 0
    assert "crack_times_seconds" in weak
    assert "crack_times_display" in weak
    assert "feedback" in weak
    strong = zxcvbn("correcthorsebatterystaple99!@#")
    assert strong["score"] >= 3
""",
    ),
    "javascript": (
        "bench_checks/public_smoke.js",
        """'use strict';
const assert = require('assert');
const utils = require('../lib/cjs/utils.js');
const ejs = require('../lib/cjs/ejs.js');

function runPublicSmoke() {
  assert.strictEqual(utils.escapeXML('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
  assert.strictEqual(utils.hyphenToCamel('rm-whitespace'), 'rmWhitespace');
  assert.strictEqual(ejs.render('Hello <%= name %>!', { name: 'World' }), 'Hello World!');
}

module.exports = { runPublicSmoke };
""",
    ),
    "go": (
        "bench_checks/public_smoke.go",
        """package gobreaker_smoke

import (
\t"errors"

\t"github.com/sony/gobreaker/v2"
)

func VerifyPublicSmoke() error {
\tcb := gobreaker.NewCircuitBreaker[string](gobreaker.Settings{Name: "smoke"})
\tres, err := cb.Execute(func() (string, error) { return "ok", nil })
\tif err != nil || res != "ok" {
\t\treturn errors.New("unexpected smoke result")
\t}
\treturn nil
}
""",
    ),
}


def write_normalized_text(dest: Path, content: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    dest.write_bytes(normalized.encode("utf-8"))


def should_skip_source(project: str, rel_posix: str) -> bool:
    parts = rel_posix.split("/")
    if any(p in {".git", "__pycache__", ".pytest_cache", ".gradle", "build", "node_modules"} for p in parts):
        return True
    name = parts[-1]
    if name in {".DS_Store"} or name.endswith((".o", ".gcda", ".gcno", ".pyc", ".class", ".jar", ".exe")):
        return True
    if project == "logistic_system":
        if rel_posix in {"src/logistics", "logistics"} or rel_posix.startswith("data/"):
            return True
    if project == "ejs":
        # Omit pre-bundled root browserify artifacts and duplicate ESM build files so starter does not leak oracle CJS code
        if rel_posix in {"ejs.js", "ejs.min.js", "package-lock.json"} or rel_posix.startswith("lib/esm/"):
            return True
    if project == "gobreaker":
        if name.endswith("_test.go") or rel_posix.endswith("go.sum"):
            return True
    return False


EJS_HOLLOWED_UTILS = """'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var utils = {};
utils.hasOwn = function (obj, key) { throw new Error('not implemented'); };
utils.escapeRegExpChars = function (string) { throw new Error('not implemented'); };
utils.escapeXML = function (markup) { throw new Error('not implemented'); };
utils.escapeXML.toString = function () { throw new Error('not implemented'); };
utils.shallowCopy = function (to, from) { throw new Error('not implemented'); };
utils.shallowCopyFromList = function (to, from, list) { throw new Error('not implemented'); };
utils.cache = {
    set: function () { throw new Error('not implemented'); },
    get: function () { throw new Error('not implemented'); },
    reset: function () { throw new Error('not implemented'); },
    remove: function () { throw new Error('not implemented'); }
};
utils.hyphenToCamel = function (str) { throw new Error('not implemented'); };
utils.createNullProtoObjWherePossible = function () { throw new Error('not implemented'); };
exports.default = utils;
module.exports = utils;
"""

def materialize(root: Path, task_id: str, variant: str) -> None:
    if task_id not in TASK_CONFIG:
        raise ValueError(f"Unknown task_id: {task_id}")
    if variant not in {"starter", "golden"}:
        raise ValueError(f"Unknown variant: {variant}")

    cfg = TASK_CONFIG[task_id]
    lang = cfg["lang"]
    project = cfg["project"]
    proj_dir = DATASETS_ROOT / lang / project
    src_dir = proj_dir / "src"
    l1_hollow_dir = proj_dir / "tasks" / cfg["l1_dir"] / "hollowed_files"
    prd_path = proj_dir / "docs" / "prd.md"

    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)

    for item in src_dir.rglob("*"):
        if not item.is_file():
            continue
        rel = item.relative_to(src_dir).as_posix()
        if should_skip_source(project, rel):
            continue
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            text = item.read_text(encoding="utf-8")
            write_normalized_text(dest, text)
        except UnicodeDecodeError:
            shutil.copy2(item, dest)

    # Write SPEC.md from PolyCodeEval PRD
    if prd_path.exists():
        write_normalized_text(root / "SPEC.md", prd_path.read_text(encoding="utf-8"))

    # Write public smoke test reference file
    smoke_rel, smoke_content = PUBLIC_SMOKE[lang]
    write_normalized_text(root / smoke_rel, smoke_content)

    full_history = task_id.endswith("-l1")
    write_cross_language_refs(root, DATASETS_ROOT, project, write_normalized_text, full_history)
    if full_history:
        repositories = json.loads(Path(__file__).with_name("history.json").read_text())
        for repo in repositories:
            archive = BENCH_ROOT / "repro" / "poly-l1-history" / (repo["name"] + ".zip")
            if hashlib.sha256(archive.read_bytes()).hexdigest() != repo["sha256"]:
                raise ValueError(f"History archive differs from pinned commit {repo['commit']}")
            with zipfile.ZipFile(archive) as snapshot:
                if len(snapshot.infolist()) != repo["files"]:
                    raise ValueError(f"Incomplete history snapshot: {archive}")
                snapshot.extractall(root / "refs" / "history" / repo["name"])

    # If starter, replace only the writable modules with PolyCodeEval's hollowed stubs
    if variant == "starter":
        for repo_rel, hollow_rel in cfg["writable"].items():
            if repo_rel == "lib/cjs/utils.js":
                write_normalized_text(root / repo_rel, EJS_HOLLOWED_UTILS)
                continue
            hollow_src = l1_hollow_dir / hollow_rel
            if not hollow_src.exists():
                raise FileNotFoundError(f"Missing hollowed file: {hollow_src}")
            write_normalized_text(root / repo_rel, hollow_src.read_text(encoding="utf-8"))


if __name__ == "__main__":
    target_root = Path(sys.argv[1]).resolve()
    task_name = sys.argv[2]
    variant_name = sys.argv[3]
    materialize(target_root, task_name, variant_name)
