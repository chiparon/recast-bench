# NL2Repo paired results: sqlparse-unlimited-high-v1

Model **gpt-6-luna**, effort `high`. Project token budget **unlimited**. Project time budget **unlimited**. Repetitions per method 1.

| Project | RECAST test pass rate | Codex test pass rate |
|---|---:|---:|
| sqlparse | 134/461 (29.07%) | 233/461 (50.54%) |
| Equal-project average | **29.07%** | **50.54%** |

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
| sqlparse | 0 | recast | 134/461 (29.07%) | 10282250 | graded |
| sqlparse | 0 | codex | 233/461 (50.54%) | 15506123 | Error: Public tests failed: WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager, possibly rendering your system unusable.It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv. Use the --root-user-action option if you know what you are doing and want to suppress this warning. Traceback (most recent call last):   File "/tmp/project/public_check.py", line 22, in <module>     assert sqlparse.format("select 1", keyword_case="upper") == "SELECT 1"            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/sqlparse/__init__.py", line 34, in format     results = [str(item) for item in stack.run(sql_text, encoding)]                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/sqlparse/engine/filter_stack.py", line 24, in run     for raw_statement in splitter.process(stream):                          ^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/sqlparse/engine/statement_splitter.py", line 38, in process     for ttype, value in stream:                         ^^^^^^   File "/tmp/project/sqlparse/filters/tokens.py", line 26, in process     if self.case and any(ttype in base for base in bases):                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/sqlparse/filters/tokens.py", line 26, in <genexpr>     if self.case and any(ttype in base for base in bases):                          ^^^^^^^^^^^^^ TypeError: 'in <string>' requires string as left operand, not _TokenType  |

Macro average: recast=29.07%, codex=50.54%

[Reproducible evidence: protocol, controls, per-trial usage and delivered files](nl2repo-sqlparse-unlimited-high-v1-evidence.json.gz)
