# NL2Repo paired results: sqlparse-unlimited-v2

Model **gpt-6-luna**, effort `low`. Project token budget **unlimited**. Project time budget **unlimited**. Repetitions per method 1.

| Project | RECAST test pass rate | Codex test pass rate |
|---|---:|---:|
| sqlparse | 0/461 (0.00%) | 85/461 (18.44%) |
| Equal-project average | **0.00%** | **18.44%** |

0/2 trials stopped at the configured budget. Fully passing deliveries: recast=0/1, codex=0/1.

Token counts below are provider-reported usage, including input and output.

The declaration-skeleton setup uses an empty reference corpus and per-file RECAST scheduling without supplied dependency edges.

## Inputs and controls

This is a declaration-skeleton variant of NL2Repo, not the original empty-workspace benchmark.

| Project | Production files | Original lines | Upstream count | Local baseline | Skeleton | Environment |
|---|---:|---:|---:|---|---|---|
| sqlparse | 21 | 4,023 | 461 | 461/464 collected | 1/461 | ready |
| rich-click | 20 | 6,785 | 145 | 139/143 collected | 4/139 | ready |
| deepdiff | 16 | 8,127 | 970 | 970/980 collected | 0/970 | ready |
| boltons | 30 | 17,005 | 423 | 423/423 collected | 2/423 | ready |
| jinja | 25 | 14,351 | 911 | 911/911 collected | 0/911 | ready |

Native controls are preparation diagnostics. Formal model scores require successful isolated controls, including a frozen list of eligible test IDs. Skips and expected failures in the original are excluded before either arm runs. Collection failures and missing tests in a generated submission remain in the fixed denominator.

## Per-trial details

| Project | Repetition | Method | Test pass rate | Reported tokens | State |
|---|---:|---|---:|---:|---|
| sqlparse | 0 | recast | 0/461 (0.00%) | 760889 | The only writable target, sqlparse/engine/grouping.py, depends on the shared sqlparse.sql token/group classes and sqlparse.tokens hierarchy, but those workspace modules are still declaration skeletons (all APIs unimplemented) and are read-only in this invocation. Grouping requires their constructors, token matching, group_tokens, and type semantics; implementing against guessed behavior cannot produce a functioning grouping module. Schedule sql.py/tokens.py first or permit those dependencies to be completed. |
| sqlparse | 0 | codex | 85/461 (18.44%) | 2029857 | Error: Public tests failed: WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager, possibly rendering your system unusable.It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv. Use the --root-user-action option if you know what you are doing and want to suppress this warning. Traceback (most recent call last):   File "/tmp/project/public_check.py", line 21, in <module>     assert sqlparse.split("select 1; select 2;") == ["select 1;", "select 2;"]            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ AssertionError  |

Macro average: recast=0.00%, codex=18.44%

[Reproducible evidence: protocol, controls, per-trial usage and delivered files](nl2repo-sqlparse-unlimited-v2-evidence.json.gz)
