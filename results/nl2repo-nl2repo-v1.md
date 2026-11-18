# NL2Repo paired results: nl2repo-v1

Model: **gpt-6-luna**, effort `low`. Each method receives the same input and a **160,000 reported-token stop threshold / 3,600 second execution budget** per project. Repetitions per method: 1.

| Project | RECAST test pass rate | Codex test pass rate |
|---|---:|---:|
| sqlparse | 1/461 (0.22%) | 1/461 (0.22%) |
| rich-click | 0/139 (0.00%) | 4/139 (2.88%) |
| deepdiff | 0/970 (0.00%) | 72/970 (7.42%) |
| boltons | 2/423 (0.47%) | 2/423 (0.47%) |
| jinja | 0/911 (0.00%) | 0/911 (0.00%) |
| Equal-project average | **0.14%** | **2.20%** |

10/10 trials stopped at the configured budget. Fully passing deliveries: recast=0/5, codex=0/5.

The threshold is checked after a provider response, so the final request can exceed it. Actual reported usage appears below; all usage records in this batch retain their completeness flag. Original harness cancellation messages are preserved in JSON, while the displayed stop reason comes from the benchmark budget controller.

These are one-budget, limited-sample results for the declaration-skeleton setup, with an empty reference corpus and per-file RECAST scheduling without supplied dependency edges. Most runs retain import/collection failures. They do not establish a general model or harness ranking.

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
| sqlparse | 0 | recast | 1/461 (0.22%) | 161576 | Error: Shared reported-token budget exhausted |
| sqlparse | 0 | codex | 1/461 (0.22%) | 163688 | Error: Shared reported-token budget exhausted |
| rich-click | 0 | recast | 0/139 (0.00%) | 176029 | Error: Shared reported-token budget exhausted |
| rich-click | 0 | codex | 4/139 (2.88%) | 178677 | Error: Shared reported-token budget exhausted |
| deepdiff | 0 | recast | 0/970 (0.00%) | 165654 | Error: Shared reported-token budget exhausted |
| deepdiff | 0 | codex | 72/970 (7.42%) | 177150 | Error: Shared reported-token budget exhausted |
| boltons | 0 | recast | 2/423 (0.47%) | 171781 | Error: Shared reported-token budget exhausted |
| boltons | 0 | codex | 2/423 (0.47%) | 178921 | Error: Shared reported-token budget exhausted |
| jinja | 0 | recast | 0/911 (0.00%) | 164868 | Error: Shared reported-token budget exhausted |
| jinja | 0 | codex | 0/911 (0.00%) | 179362 | Error: Shared reported-token budget exhausted |

Macro average: recast=0.14%, codex=2.20%

[Reproducible evidence: protocol, controls, per-trial usage and delivered files](nl2repo-nl2repo-v1-evidence.json.gz)
