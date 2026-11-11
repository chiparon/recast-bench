# GPT-6 Luna · SAG2 的 Python、Go L1 重跑

以 v5 同题、同模型和同方法作配对基线。v6 更新编辑哈希冲突后的重读与重试反馈，并记录服务端错误详情。两版共享同一冻结输入和 127,999 行历史索引，每个组合运行一次。

| L1 任务 | 整题交付（v5 → v6） | 外部用例 | 端到端秒 | token | 模型请求数 |
|---|---|---|---:|---:|---:|
| poly-py-zxcvbn-l1 | 失败 → 失败 | 0/41 → 0/41 | 295.1 → 135.4 | ≥ 1,878,740 → 445,269 | 66 → 24 |
| poly-go-gobreaker-l1 | 失败 → 失败 | 14/45 → 12/45 | 80.9 → 98.0 | 383,324 → 412,360 | 17 → 19 |

耗时包含索引、失败试验与交付评分。≥ 表示至少有一次请求没有返回服务端用量。两份 v6 交付输出均从冻结骨架重新执行外部测试，并与原记录逐项核对用例、Git 交付状态和请求用量。

## v6 模块记录

| 题目 | 模块 | 最终状态 | 模型轮数 | 冲突后自动重读次数 | 后续成功编辑的冲突区间数 |
|---|---|---|---:|---:|---:|
| poly-py-zxcvbn-l1 | scoring | completed | 11 | 0 | 0 |
| poly-py-zxcvbn-l1 | matching | failed | 13 | 1 | 1 |
| poly-go-gobreaker-l1 | counter | failed | 19 | 0 | 0 |

Python 的 matching 遇到一次哈希冲突，运行时返回最新内容和哈希，下一轮编辑成功修改了四处。两次模块验收均通过 6/12，模型随后报告阻塞。v5 的五次 matching 验收最高通过 8/12。本次两题均未收到 HTTP 400；服务端详情和请求 ID 的记录路径由模拟错误响应的回归测试覆盖。

Go 的 counter 通过 12/16。与 v5 相比，本轮额外失败的是 `TestRollingCountsBucketAtCalculation` 和 `TestRollingCountsGrowFastForward`；两版都未通过 `TestRollingCountsBucketAt` 和 `TestRollingCountsGrow`。

[v5 对照报告](poly-v5-l1-python-go-vs-v4.md) · [本轮逐次验证数据](poly-v6-sag2-python-go-vs-v5-evidence.json.gz)
