# NL2Repo skeleton reconstruction benchmark

This is a declaration-skeleton variant of NL2Repo, not the original empty-workspace benchmark.

| Project | Production files | Original lines | Upstream count | Local baseline | Skeleton | Environment |
|---|---:|---:|---:|---|---|---|
| sqlparse | 21 | 4,023 | 461 | 461/464 collected | 1/461 | ready |
| rich-click | 20 | 6,785 | 145 | 139/143 collected | 4/139 | ready |
| deepdiff | 16 | 8,127 | 970 | 970/980 collected | 0/970 | ready |
| boltons | 30 | 17,005 | 423 | 423/423 collected | 2/423 | ready |
| jinja | 25 | 14,351 | 911 | 911/911 collected | 0/911 | ready |

Native controls are preparation diagnostics. Formal model scores require successful isolated controls, including a frozen list of eligible test IDs. Skips and expected failures in the original are excluded before either arm runs. Collection failures and missing tests in a generated submission remain in the fixed denominator.
