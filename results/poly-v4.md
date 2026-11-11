# PolyCodeEval 五语言双粒度项目交付基准报告

5/20 次试验通过独立黑盒交付验收；底层 10 个任务（C++ / Java / Python / JS / Go × L1 / L2）共 49 组 Golden / Starter / 逐模块消融对照与 SAG2-SQLite 结构化索引校准 100% 通过。

## 一、测试集重构背景：为何从 large-v3 (Django) 迁移至 PolyCodeEval

在前序批次 large-v3（十万行级 Django 后台单点补全基准）中，36 次正式试验暴露出测试集结构与 RECAST 核心能力之间的错位：large-v3 每道题仅挖空 2～3 个局部函数（约 40～80 行改动），且在题目 Prompt 中直接给出了近似伪代码级的逐步实现指令。这导致单会话直接改文件的 rawagent（5/9，55.6%，平均 61.9 秒）与 Codex CLI（5/9，55.6%，平均 137.3 秒）占优，而走完整多阶段架构流水线（spec → arch → impl）的 RECAST（3/9，33.3%，平均 141.6 秒）及带冷建索引的 SAG2-SQLite（3/9，33.3%，平均 164.0 秒）反而把跨模块规划与索引变成了纯耗时和上下文开销。

对比两项候选外部基准：NL2Repo-Bench 主打 L0 空目录从零生成完整 Python 仓库，起始工作区不存在任何可被 SAG2-SQLite（Tree-sitter + SQLite FTS5 + JEV 符号依赖图）扫描的上游代码，且仅覆盖 Python 单一语言；而 PolyCodeEval（arXiv:2610.11618）覆盖 C++、Java、Python、JavaScript/TypeScript、Go 五大主流工程语言共 58 个真实多文件项目，原生提供 PRD 需求文档（docs/prd.md）、分级挖空骨架（L1 全项目骨架、L2 模块/文件级切片、L3 函数级）以及独立黑盒测试与端到端验收测试，天然契合潍柴 RECAST 的多语言代码智能与跨模块协同生成场景。

| 评估维度 | 原 large-v3 (Django 局部补全基准) | NL2Repo-Bench (空目录端到端仓库生成) | 新建 poly-v1 (PolyCodeEval 双粒度多语言基准) |
| --- | --- | --- | --- |
| 编程语言覆盖 | 仅 Python + 少量前端 JS（脱离 C++/Java/Go 工业栈） | 仅 Python 单一语言 | C++17、Java、Python、JavaScript (Node.js)、Go 五大语言全覆盖 |
| 任务粒度与模块拓扑 | 2～3 个文件内挖空零散函数，几乎无跨模块拓扑依赖 | L0 全空目录生成，无既有架构边界约束 | 同时支持 L1（全项目 3～4 模块拓扑链）与 L2（核心 2 模块切片）同台对比 |
| 需求规范形态 | Prompt 手把手指定属性名与分支逻辑（喂饭式伪代码） | 仅自然语言文档，缺乏接口签名锚点 | 采用 PolyCodeEval 原生 PRD (SPEC.md) + 真实头文件/接口签名契约 |
| 对 RECAST 流水线的区分度 | 任务过小，ProjectPipeline 多阶段规划沦为纯延迟开销 | 跨度过大且无模块级增量编译检查锚点 | L1 检验全链路拓扑规划与按模块自检，L2 检验局部模块精准协同 |
| 对 SAG2-SQLite 检索的区分度 | 目标函数位置已知，FTS5 + JEV 索引几乎无用武之地 | 初始目录为空（0 个参考文件），无法建立结构化索引 | 每题强制保留 1～7 个只读上游参考源码/头文件，索引命中直接决定接口一致性 |
| 执行与验收环境 | 依赖特定 Django 虚拟环境与 AST 补丁 | 依赖重型容器镜像 | 免 Docker 宿主机原生五语言离线工具链 + 临时沙箱隔离，零污染工作区 |

## 二、PolyCodeEval 双粒度任务矩阵与冻结输入（5 语言 × L1 / L2）

本批次（poly-v4）从已拉取解压至本地的 PolyCodeEval 五语言镜像层（58 个工程）中，精选 5 个代表性多模块工程（每语言 1 个），并同时构建 L1（Full Project Skeleton，全项目核心业务模块整体挖空）与 L2（Key Multi-Module Slice，保留上下游真实实现、仅挖空核心耦合模块对）两套粒度，合计 10 个标准测试集 Fixture。

所有任务均通过 SHA-256 文件清单（treeHash）与公开规格哈希（inputHash）冻结。工作区统一注入 PolyCodeEval 原生 PRD 文档（SPEC.md）及公开冒烟参考（bench_checks/*），且在构建阶段严格剔除任何可能泄漏 Oracle 实现的打包产物（如 EJS 的浏览器 bundle ejs.js / ejs.min.js / lib/esm/*）或超长词表（如 zxcvbn 超过 256 KB 限制的 653 KB 词频表 frequency_lists.py 自动排除出可读列表但保留运行时加载）。

| 任务 ID | 粒度 | 所属工程与语言（物理行） | 冻结/可读文件 | 生产/可读源码行 | 可写模块拓扑链 (dependsOn) | 输入指纹 (inputHash / treeHash) |
| --- | --- | --- | --- | --- | --- | --- |
| poly-cpp-logistics-l1 | L1 | C++ Logistics Management System (L1 Full Skeleton) · C++ 3,484、C 89,613、C# 3,560、JavaScript 5,468、Java 3,628、Python 5,967、Go 16,889 | 351 / 221 | 128,609 / 128,787 | account(src/account.cpp) ； expressage(src/expressage.cpp) ← [account] ； logistics(src/logistics.cpp) ← [account, expressage] ； cli(src/main.cpp) ← [logistics] | 6892abba181a / c6cf1d60172c |
| poly-cpp-logistics-l2 | L2 | C++ Logistics Management System (L2 Core Domain Slice) · C++ 590、C 104、Go 975、Java 652、JavaScript 382、TypeScript 123、Python 807 | 26 / 23 | 3,633 / 3,811 | expressage(src/expressage.cpp) ； logistics(src/logistics.cpp) ← [expressage] | 85c711e0171b / febfca539d13 |
| poly-java-idcenter-l1 | L1 | Java Distributed ID & Base62 Suite (L1 Full Skeleton) · Java 3,763、Go 17,035、C++ 3,311、C 89,509、C# 3,560、JavaScript 5,468、Python 5,805 | 350 / 218 | 128,451 / 128,511 | base62(src/main/java/com/sohu/idcenter/Base62.java) ； idworker(src/main/java/com/sohu/idcenter/IdWorker.java) ； sidworker(src/main/java/com/sohu/idcenter/SidWorker.java) ； cli(src/main/java/com/sohu/idcenter/Main.java) ← [idworker, sidworker] | 40cde4a94d1f / b00f9d5b6c4d |
| poly-java-idcenter-l2 | L2 | Java Distributed ID & Base62 Suite (L2 Core Codec & Snowflake Slice) · Java 840、C++ 201、Go 1,121、JavaScript 382、TypeScript 123、Python 645 | 25 / 20 | 3,312 / 3,372 | base62(src/main/java/com/sohu/idcenter/Base62.java) ； idworker(src/main/java/com/sohu/idcenter/IdWorker.java) | 6b7e6ebcb338 / 1d4129fb5808 |
| poly-py-zxcvbn-l1 | L1 | Python zxcvbn Password Strength Estimator (L1 Full Pipeline) · Python 6,045、Go 16,937、C++ 3,311、C 89,509、C# 3,560、JavaScript 5,666、Java 3,524 | 356 / 221 | 128,552 / 128,780 | matching(zxcvbn/matching.py) ； scoring(zxcvbn/scoring.py) ← [matching] ； time_estimates(zxcvbn/time_estimates.py) ← [scoring] ； feedback(zxcvbn/feedback.py) ← [scoring] | e41d0d1d6fb8 / 972bd6f8f59a |
| poly-py-zxcvbn-l2 | L2 | Python zxcvbn Password Strength Estimator (L2 Time Estimates & Feedback Slice) · Python 1,794、C++ 201、Go 1,023、Java 548、JavaScript 580、TypeScript 123 | 31 / 23 | 4,269 / 4,497 | time_estimates(zxcvbn/time_estimates.py) ； feedback(zxcvbn/feedback.py) | b52e54e3cc34 / 74551ba526a5 |
| poly-js-ejs-l1 | L1 | JavaScript EJS Template Compiler & CLI (L1 Full Skeleton) · JavaScript 6,537、Go 16,968、C++ 3,311、C 89,509、C# 3,560、Java 3,524、Python 5,806 | 537 / 222 | 129,215 / 129,297 | utils(lib/cjs/utils.js) ； engine(lib/cjs/ejs.js) ← [utils] ； cli(bin/cli.js) ← [engine, utils] | c2cde8d0d032 / 76f552391f70 |
| poly-js-ejs-l2 | L2 | JavaScript EJS Template Compiler & CLI (L2 Core Runtime & Compiler Slice) · JavaScript 1,541、C++ 201、Go 1,054、Java 548、TypeScript 123、Python 646 | 212 / 24 | 4,113 / 4,195 | utils(lib/cjs/utils.js) ； engine(lib/cjs/ejs.js) ← [utils] | b8cedddcae56 / 634cdd4d245e |
| poly-go-gobreaker-l1 | L1 | Go Generic & Distributed Circuit Breaker v2 (L1 Full Package) · Go 17,877、C++ 3,311、C 89,509、C# 3,560、JavaScript 5,468、Java 3,672、Python 5,784 | 355 / 221 | 129,181 / 129,266 | counter(v2/counter.go) ； breaker(v2/gobreaker.go) ← [counter] ； twostep(v2/twostep_gobreaker.go) ← [breaker] ； distributed(v2/distributed_gobreaker.go) ← [breaker] | 2588365e5f3c / 8d79ed738900 |
| poly-go-gobreaker-l2 | L2 | Go Generic & Distributed Circuit Breaker v2 (L2 Rolling Counter & Distributed Breaker Slice) · Go 2,154、C++ 201、Java 696、JavaScript 382、TypeScript 123、Python 624 | 30 / 23 | 4,180 / 4,265 | counter(v2/counter.go) ； distributed(v2/distributed_gobreaker.go) ← [counter] | 1683338948f3 / c7d3aad5762e |

## 三、零成本对照校准与逐模块消融验证（Golden / Starter / Per-Module Ablation）

在投入任何付费模型 API 调用之前，10 个任务全部通过了严格的零成本三阶校准（共计 49 次对照运行、187 项子测试判定）：（1）Golden 正向对照：注入 PolyCodeEval 官方 Oracle 实现，公开构建、公开测试及外部黑盒/端到端验收必须 100% 通过；（2）Starter 负向对照：注入 PolyCodeEval 官方挖空骨架（L1_*/hollowed_files），必须被测试集准确拦截并判定失败；（3）逐模块消融（Per-Module Ablation）：在 Golden 基础上每次仅将 1 个可写模块回退为 Starter 挖空态（共 29 个消融变体），外部验收必须精确捕获该模块的缺失并判定失败，证明没有任何一个可写模块是「假模块」或测试盲区。

此外，每次对照运行结束后均重新计算 Starter 与 Golden 工作区的 SHA-256 清单哈希，强制断言编译、测试与验收全过程对源码树实现零修改（Workspace Immutability）。

| 任务 ID | 粒度 | Golden 正向对照 | Starter 负向对照 | 逐模块消融 (Per-Module Ablation) 明细 | 工作区零污染校验 |
| --- | --- | --- | --- | --- | --- |
| poly-cpp-logistics-l1 | L1 | 通过 4/4 (account:✓ expressage:✓ logistics:✓ cli:✓)；用例 54/54 (100.0%，相对 starter 增益 100.0%) | 拦截成功 0/4 (account:✗ expressage:✗ logistics:✗ cli:✗)；用例 2/54 (3.7%，相对 starter 增益 0.0%) | 缺 src/account.cpp → 1/4 (account:✗ expressage:✓ logistics:✗ cli:✗)；用例 28/54 (51.9%，相对 starter 增益 50.0%) ； 缺 src/expressage.cpp → 1/4 (account:✓ expressage:✗ logistics:✗ cli:✗)；用例 36/54 (66.7%，相对 starter 增益 65.4%) ； 缺 src/logistics.cpp → 2/4 (account:✓ expressage:✓ logistics:✗ cli:✗)；用例 14/54 (25.9%，相对 starter 增益 23.1%) ； 缺 src/main.cpp → 3/4 (account:✓ expressage:✓ logistics:✓ cli:✗)；用例 47/54 (87.0%，相对 starter 增益 86.5%) | 通过 (treeHash=c6cf1d6017) |
| poly-cpp-logistics-l2 | L2 | 通过 4/4 (account:✓ expressage:✓ logistics:✓ cli:✓)；用例 54/54 (100.0%，相对 starter 增益 100.0%) | 拦截成功 1/4 (account:✓ expressage:✗ logistics:✗ cli:✗)；用例 8/54 (14.8%，相对 starter 增益 0.0%) | 缺 src/expressage.cpp → 1/4 (account:✓ expressage:✗ logistics:✗ cli:✗)；用例 36/54 (66.7%，相对 starter 增益 60.9%) ； 缺 src/logistics.cpp → 2/4 (account:✓ expressage:✓ logistics:✗ cli:✗)；用例 14/54 (25.9%，相对 starter 增益 13.0%) | 通过 (treeHash=febfca539d) |
| poly-java-idcenter-l1 | L1 | 通过 4/4 (base62:✓ idworker:✓ sidworker:✓ cli:✓)；用例 53/53 (100.0%，相对 starter 增益 100.0%) | 拦截成功 0/4 (base62:✗ idworker:✗ sidworker:✗ cli:✗)；用例 0/53 (0.0%，相对 starter 增益 0.0%) | 缺 src/main/java/com/sohu/idcenter/Base62.java → 3/4 (base62:✗ idworker:✓ sidworker:✓ cli:✓)；用例 30/53 (56.6%，相对 starter 增益 56.6%) ； 缺 src/main/java/com/sohu/idcenter/IdWorker.java → 2/4 (base62:✓ idworker:✗ sidworker:✓ cli:✗)；用例 29/53 (54.7%，相对 starter 增益 54.7%) ； 缺 src/main/java/com/sohu/idcenter/SidWorker.java → 2/4 (base62:✓ idworker:✓ sidworker:✗ cli:✗)；用例 49/53 (92.5%，相对 starter 增益 92.5%) ； 缺 src/main/java/com/sohu/idcenter/Main.java → 3/4 (base62:✓ idworker:✓ sidworker:✓ cli:✗)；用例 49/53 (92.5%，相对 starter 增益 92.5%) | 通过 (treeHash=b00f9d5b6c) |
| poly-java-idcenter-l2 | L2 | 通过 4/4 (base62:✓ idworker:✓ sidworker:✓ cli:✓)；用例 53/53 (100.0%，相对 starter 增益 100.0%) | 拦截成功 1/4 (base62:✗ idworker:✗ sidworker:✓ cli:✗)；用例 6/53 (11.3%，相对 starter 增益 0.0%) | 缺 src/main/java/com/sohu/idcenter/Base62.java → 3/4 (base62:✗ idworker:✓ sidworker:✓ cli:✓)；用例 30/53 (56.6%，相对 starter 增益 51.1%) ； 缺 src/main/java/com/sohu/idcenter/IdWorker.java → 2/4 (base62:✓ idworker:✗ sidworker:✓ cli:✗)；用例 29/53 (54.7%，相对 starter 增益 48.9%) | 通过 (treeHash=1d4129fb58) |
| poly-py-zxcvbn-l1 | L1 | 通过 4/4 (matching:✓ scoring:✓ time_estimates:✓ feedback:✓)；用例 41/41 (100.0%，相对 starter 增益 100.0%) | 拦截成功 0/4 (matching:✗ scoring:✗ time_estimates:✗ feedback:✗)；用例 0/41 (0.0%，相对 starter 增益 0.0%) | 缺 zxcvbn/matching.py → 0/4 (matching:✗ scoring:✗ time_estimates:✗ feedback:✗)；用例 0/41 (0.0%，相对 starter 增益 0.0%) ； 缺 zxcvbn/scoring.py → 0/4 (matching:✗ scoring:✗ time_estimates:✗ feedback:✗)；用例 0/41 (0.0%，相对 starter 增益 0.0%) ； 缺 zxcvbn/time_estimates.py → 0/4 (matching:✗ scoring:✗ time_estimates:✗ feedback:✗)；用例 1/41 (2.4%，相对 starter 增益 2.4%) ； 缺 zxcvbn/feedback.py → 3/4 (matching:✓ scoring:✓ time_estimates:✓ feedback:✗)；用例 31/41 (75.6%，相对 starter 增益 75.6%) | 通过 (treeHash=972bd6f8f5) |
| poly-py-zxcvbn-l2 | L2 | 通过 4/4 (matching:✓ scoring:✓ time_estimates:✓ feedback:✓)；用例 41/41 (100.0%，相对 starter 增益 100.0%) | 拦截成功 0/4 (matching:✗ scoring:✗ time_estimates:✗ feedback:✗)；用例 1/41 (2.4%，相对 starter 增益 0.0%) | 缺 zxcvbn/time_estimates.py → 0/4 (matching:✗ scoring:✗ time_estimates:✗ feedback:✗)；用例 1/41 (2.4%，相对 starter 增益 0.0%) ； 缺 zxcvbn/feedback.py → 3/4 (matching:✓ scoring:✓ time_estimates:✓ feedback:✗)；用例 31/41 (75.6%，相对 starter 增益 75.0%) | 通过 (treeHash=74551ba526) |
| poly-js-ejs-l1 | L1 | 通过 3/3 (utils:✓ engine:✓ cli:✓)；用例 119/119 (100.0%，相对 starter 增益 100.0%) | 拦截成功 0/3 (utils:✗ engine:✗ cli:✗)；用例 13/119 (10.9%，相对 starter 增益 0.0%) | 缺 lib/cjs/utils.js → 0/3 (utils:✗ engine:✗ cli:✗)；用例 13/119 (10.9%，相对 starter 增益 0.0%) ； 缺 lib/cjs/ejs.js → 1/3 (utils:✓ engine:✗ cli:✗)；用例 61/119 (51.3%，相对 starter 增益 45.3%) ； 缺 bin/cli.js → 2/3 (utils:✓ engine:✓ cli:✗)；用例 106/119 (89.1%，相对 starter 增益 87.7%) | 通过 (treeHash=76f552391f) |
| poly-js-ejs-l2 | L2 | 通过 3/3 (utils:✓ engine:✓ cli:✓)；用例 119/119 (100.0%，相对 starter 增益 100.0%) | 拦截成功 0/3 (utils:✗ engine:✗ cli:✗)；用例 13/119 (10.9%，相对 starter 增益 0.0%) | 缺 lib/cjs/utils.js → 0/3 (utils:✗ engine:✗ cli:✗)；用例 13/119 (10.9%，相对 starter 增益 0.0%) ； 缺 lib/cjs/ejs.js → 1/3 (utils:✓ engine:✗ cli:✗)；用例 61/119 (51.3%，相对 starter 增益 45.3%) | 通过 (treeHash=634cdd4d24) |
| poly-go-gobreaker-l1 | L1 | 通过 4/4 (counter:✓ breaker:✓ twostep:✓ distributed:✓)；用例 45/45 (100.0%，相对 starter 增益 100.0%) | 拦截成功 0/4 (counter:✗ breaker:✗ twostep:✗ distributed:✗)；用例 0/45 (0.0%，相对 starter 增益 0.0%) | 缺 v2/counter.go → 0/4 (counter:✗ breaker:✗ twostep:✗ distributed:✗)；用例 1/45 (2.2%，相对 starter 增益 2.2%) ； 缺 v2/gobreaker.go → 1/4 (counter:✓ breaker:✗ twostep:✗ distributed:✗)；用例 16/45 (35.6%，相对 starter 增益 35.6%) ； 缺 v2/twostep_gobreaker.go → 3/4 (counter:✓ breaker:✓ twostep:✗ distributed:✓)；用例 36/45 (80.0%，相对 starter 增益 80.0%) ； 缺 v2/distributed_gobreaker.go → 3/4 (counter:✓ breaker:✓ twostep:✓ distributed:✗)；用例 33/45 (73.3%，相对 starter 增益 73.3%) | 通过 (treeHash=8d79ed7389) |
| poly-go-gobreaker-l2 | L2 | 通过 4/4 (counter:✓ breaker:✓ twostep:✓ distributed:✓)；用例 45/45 (100.0%，相对 starter 增益 100.0%) | 拦截成功 0/4 (counter:✗ breaker:✗ twostep:✗ distributed:✗)；用例 1/45 (2.2%，相对 starter 增益 0.0%) | 缺 v2/counter.go → 0/4 (counter:✗ breaker:✗ twostep:✗ distributed:✗)；用例 1/45 (2.2%，相对 starter 增益 0.0%) ； 缺 v2/distributed_gobreaker.go → 3/4 (counter:✓ breaker:✓ twostep:✓ distributed:✗)；用例 33/45 (73.3%，相对 starter 增益 72.7%) | 通过 (treeHash=c7d3aad576) |

## 四、五语言混合参考池（refs/）与 SAG2-SQLite 跨语言检索召回验证

L1 的历史库由 LuaJIT、go-yaml 和 diff-match-patch 三个仓库的完整 Git 快照组成。各题共用同一组提交，另保留本题的跨语言参考实现和同项目参考。L2 沿用原有的 11 个干扰文件。历史库 LoC 按 SAG2 已建索引并投影为可检索模块的历史源码物理行计数，包含注释、空行和上游测试。

在 --controls 校准阶段，框架对全部 10 个任务实测运行了 openRealIndex 与 searchModulesWithSag2（topK = 3, maxHops = 2），完整记录了每个可写模块在混合五语言索引库中的 Top-3 召回候选、跨语言结对方向（sourceLanguage → targetLanguage）及对跨语言真值参考与噪声文件的区分表现：

| L1 任务 | 历史仓库（已索引行数） | 已索引历史文件 | 已索引历史 LoC |
| --- | --- | --- | --- |
| poly-cpp-logistics-l1 | diff-match-patch (23,321)、go-yaml (16,889)、luajit (87,789) | 209 | 127,999 |
| poly-java-idcenter-l1 | diff-match-patch (23,321)、go-yaml (16,889)、luajit (87,789) | 209 | 127,999 |
| poly-py-zxcvbn-l1 | diff-match-patch (23,321)、go-yaml (16,889)、luajit (87,789) | 209 | 127,999 |
| poly-js-ejs-l1 | diff-match-patch (23,321)、go-yaml (16,889)、luajit (87,789) | 209 | 127,999 |
| poly-go-gobreaker-l1 | diff-match-patch (23,321)、go-yaml (16,889)、luajit (87,789) | 209 | 127,999 |

| 任务 ID | 粒度 | 参考池总文件 / 建库文件 | 工作区源码语言及文件数 | 跨语言真值参考文件 (Cross-Language Ground Truth Refs) | 同项目内生参考文件 (Intra-Project Refs) | 背景参考文件 |
| --- | --- | --- | --- | --- | --- | --- |
| poly-cpp-logistics-l1 | L1 | 216 / 216 | C++:8, C:172, C#:3, JavaScript:4, Java:4, Python:10, Go:19 | refs/python/logistics_account_expressage_ref.py、refs/python/logistics_sys_service_ref.py、refs/java/LogisticsCliLoopRef.java | bench_checks/public_smoke.cpp、include/account.h、include/expressage.h、include/logistics.h | 209 个文件 |
| poly-cpp-logistics-l2 | L2 | 20 / 20 | C++:7, C:3, Go:2, Java:3, JavaScript:2, TypeScript:1, Python:4 | refs/python/logistics_account_expressage_ref.py、refs/python/logistics_sys_service_ref.py、refs/java/LogisticsCliLoopRef.java | bench_checks/public_smoke.cpp、include/account.h、include/expressage.h、include/logistics.h、src/account.cpp、src/main.cpp | 11 个文件 |
| poly-java-idcenter-l1 | L1 | 213 / 213 | Java:8, Go:21, C++:3, C:169, C#:3, JavaScript:4, Python:9 | refs/go/base62_codec_ref.go、refs/go/snowflake_idworker_ref.go、refs/python/sidworker_and_cli_ref.py | bench_checks/PublicSmoke.java | 209 个文件 |
| poly-java-idcenter-l2 | L2 | 17 / 17 | Java:7, C++:2, Go:4, JavaScript:2, TypeScript:1, Python:3 | refs/go/base62_codec_ref.go、refs/go/snowflake_idworker_ref.go、refs/python/sidworker_and_cli_ref.py | bench_checks/PublicSmoke.java、src/main/java/com/sohu/idcenter/Main.java、src/main/java/com/sohu/idcenter/SidWorker.java | 11 个文件 |
| poly-py-zxcvbn-l1 | L1 | 216 / 216 | Python:17, Go:20, C++:3, C:169, C#:3, JavaScript:6, Java:3 | refs/js/zxcvbn_time_estimates_ref.js、refs/js/zxcvbn_feedback_ref.js、refs/go/zxcvbn_matching_scoring_ref.go | bench_checks/public_smoke.py、zxcvbn/__init__.py、zxcvbn/__main__.py、zxcvbn/adjacency_graphs.py | 209 个文件 |
| poly-py-zxcvbn-l2 | L2 | 20 / 20 | Python:11, C++:2, Go:3, Java:2, JavaScript:4, TypeScript:1 | refs/js/zxcvbn_time_estimates_ref.js、refs/js/zxcvbn_feedback_ref.js、refs/go/zxcvbn_matching_scoring_ref.go | bench_checks/public_smoke.py、zxcvbn/__init__.py、zxcvbn/__main__.py、zxcvbn/adjacency_graphs.py、zxcvbn/matching.py、zxcvbn/scoring.py | 11 个文件 |
| poly-js-ejs-l1 | L1 | 218 / 218 | JavaScript:14, Go:20, C++:3, C:169, C#:3, Java:3, Python:9 | refs/python/ejs_utils_ref.py、refs/go/ejs_cli_and_compiler_ref.go | bench_checks/public_smoke.js、examples/express/app.js、examples/functions.js、examples/list.js、examples/output-function.js、examples/slot/index.js、lib/cjs/parseargs.js | 209 个文件 |
| poly-js-ejs-l2 | L2 | 21 / 20 | JavaScript:12, C++:2, Go:3, Java:2, TypeScript:1, Python:3 | refs/python/ejs_utils_ref.py、refs/go/ejs_cli_and_compiler_ref.go | bench_checks/public_smoke.js、examples/express/app.js、examples/functions.js、examples/list.js、examples/output-function.js、examples/slot/index.js、lib/cjs/parseargs.js | 11 个文件 |
| poly-go-gobreaker-l1 | L1 | 216 / 216 | Go:28, C++:3, C:169, C#:3, JavaScript:4, Java:4, Python:9 | refs/java/RollingCountsRef.java、refs/python/distributed_gobreaker_ref.py | bench_checks/public_smoke.go、example/http_breaker.go、gobreaker.go、v2/example/http_breaker.go、v2/redis/store.go | 209 个文件 |
| poly-go-gobreaker-l2 | L2 | 20 / 20 | Go:11, C++:2, Java:3, JavaScript:2, TypeScript:1, Python:3 | refs/java/RollingCountsRef.java、refs/python/distributed_gobreaker_ref.py | bench_checks/public_smoke.go、example/http_breaker.go、gobreaker.go、v2/example/http_breaker.go、v2/gobreaker.go、v2/redis/store.go、v2/twostep_gobreaker.go | 11 个文件 |

| 任务 ID | 可写目标模块 (Target Language) | Top-1 跨语言配对方向 | SAG2-SQLite (BM25 + JEV 2-Hop) Top-3 召回候选明细 | 跨语言真值命中 / 零噪声污染 |
| --- | --- | --- | --- | --- |
| poly-cpp-logistics-l1 (L1) | account (src/account.cpp · C++) | C → C++ | #1 [◆同项目参考 · C] include/account.h (score=0.9125) ； #2 [★跨语言真值 · Python] refs/python/logistics_account_expressage_ref.py (score=0.825) ； #3 [◆同项目参考 · C] include/logistics.h (score=0.7136) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-cpp-logistics-l1 (L1) | expressage (src/expressage.cpp · C++) | C → C++ | #1 [◆同项目参考 · C] include/expressage.h (score=0.8671) ； #2 [◆同项目参考 · C] include/logistics.h (score=0.7905) ； #3 [★跨语言真值 · Python] refs/python/logistics_account_expressage_ref.py (score=0.7334) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-cpp-logistics-l1 (L1) | logistics (src/logistics.cpp · C++) | C → C++ | #1 [◆同项目参考 · C] include/logistics.h (score=0.7175) ； #2 [★跨语言真值 · Python] refs/python/logistics_sys_service_ref.py (score=0.6857) ； #3 [★跨语言真值 · Java] refs/java/LogisticsCliLoopRef.java (score=0.653) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-cpp-logistics-l1 (L1) | cli (src/main.cpp · C++) | Java → C++ | #1 [★跨语言真值 · Java] refs/java/LogisticsCliLoopRef.java (score=0.87) ； #2 [◆同项目参考 · C] include/logistics.h (score=0.6194) ； #3 [★跨语言真值 · Python] refs/python/logistics_sys_service_ref.py (score=0.6128) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-cpp-logistics-l2 (L2) | expressage (src/expressage.cpp · C++) | C → C++ | #1 [◆同项目参考 · C] include/expressage.h (score=0.8671) ； #2 [★跨语言真值 · Python] refs/python/logistics_account_expressage_ref.py (score=0.852) ； #3 [◆同项目参考 · C] include/logistics.h (score=0.7025) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-cpp-logistics-l2 (L2) | logistics (src/logistics.cpp · C++) | C → C++ | #1 [◆同项目参考 · C] include/logistics.h (score=0.7901) ； #2 [★跨语言真值 · Python] refs/python/logistics_sys_service_ref.py (score=0.7452) ； #3 [★跨语言真值 · Java] refs/java/LogisticsCliLoopRef.java (score=0.7141) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-java-idcenter-l1 (L1) | base62 (src/main/java/com/sohu/idcenter/Base62.java · Java) | Go → Java | #1 [★跨语言真值 · Go] refs/go/base62_codec_ref.go (score=0.825) ； #2 [背景参考 · Java] refs/history/diff-match-patch/java/src/name/fraser/neil/plaintext/diff_match_patch.java (score=0.7906) ； #3 [背景参考 · C#] refs/history/diff-match-patch/csharp/DiffMatchPatch.cs (score=0.6843) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-java-idcenter-l1 (L1) | idworker (src/main/java/com/sohu/idcenter/IdWorker.java · Java) | Python → Java | #1 [★跨语言真值 · Python] refs/python/sidworker_and_cli_ref.py (score=0.825) ； #2 [★跨语言真值 · Go] refs/go/snowflake_idworker_ref.go (score=0.7825) ； #3 [背景参考 · Go] refs/history/go-yaml/resolve.go (score=0.4168) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-java-idcenter-l1 (L1) | sidworker (src/main/java/com/sohu/idcenter/SidWorker.java · Java) | Python → Java | #1 [★跨语言真值 · Python] refs/python/sidworker_and_cli_ref.py (score=0.87) ； #2 [★跨语言真值 · Go] refs/go/snowflake_idworker_ref.go (score=0.4835) ； #3 [背景参考 · Go] refs/history/go-yaml/resolve.go (score=0.4501) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-java-idcenter-l1 (L1) | cli (src/main/java/com/sohu/idcenter/Main.java · Java) | Python → Java | #1 [★跨语言真值 · Python] refs/python/sidworker_and_cli_ref.py (score=1) ； #2 [背景参考 · C] refs/history/luajit/src/host/buildvm.c (score=0.6451) ； #3 [背景参考 · C] refs/history/luajit/src/luajit.c (score=0.6077) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-java-idcenter-l2 (L2) | base62 (src/main/java/com/sohu/idcenter/Base62.java · Java) | Go → Java | #1 [★跨语言真值 · Go] refs/go/base62_codec_ref.go (score=0.8833) ； #2 [◆同项目参考 · Java] bench_checks/PublicSmoke.java (score=0.8833) ； #3 [背景参考 · C++] refs/distractors/cpp/base64pp.cpp (score=0.7099) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-java-idcenter-l2 (L2) | idworker (src/main/java/com/sohu/idcenter/IdWorker.java · Java) | Go → Java | #1 [★跨语言真值 · Go] refs/go/snowflake_idworker_ref.go (score=0.8648) ； #2 [◆同项目参考 · Java] src/main/java/com/sohu/idcenter/SidWorker.java (score=0.6856) ； #3 [◆同项目参考 · Java] bench_checks/PublicSmoke.java (score=0.675) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-py-zxcvbn-l1 (L1) | matching (zxcvbn/matching.py · Python) | TypeScript → Python | #1 [★跨语言真值 · TypeScript] refs/js/zxcvbn_feedback_ref.js (score=0.6908) ； #2 [★跨语言真值 · Go] refs/go/zxcvbn_matching_scoring_ref.go (score=0.5038) ； #3 [◆同项目参考 · Python] zxcvbn/adjacency_graphs.py (score=0.4882) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-py-zxcvbn-l1 (L1) | scoring (zxcvbn/scoring.py · Python) | TypeScript → Python | #1 [★跨语言真值 · TypeScript] refs/js/zxcvbn_feedback_ref.js (score=0.8075) ； #2 [★跨语言真值 · Go] refs/go/zxcvbn_matching_scoring_ref.go (score=0.4904) ； #3 [背景参考 · C] refs/history/diff-match-patch/objectivec/NSMutableDictionary+DMPExtensions.h (score=0.479) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-py-zxcvbn-l1 (L1) | time_estimates (zxcvbn/time_estimates.py · Python) | TypeScript → Python | #1 [★跨语言真值 · TypeScript] refs/js/zxcvbn_time_estimates_ref.js (score=0.8183) ； #2 [背景参考 · C] refs/history/diff-match-patch/cpp/diff_match_patch.h (score=0.5811) ； #3 [背景参考 · Python] refs/history/diff-match-patch/python2/diff_match_patch.py (score=0.5726) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-py-zxcvbn-l1 (L1) | feedback (zxcvbn/feedback.py · Python) | TypeScript → Python | #1 [★跨语言真值 · TypeScript] refs/js/zxcvbn_feedback_ref.js (score=1) ； #2 [背景参考 · C] refs/history/diff-match-patch/objectivec/NSMutableDictionary+DMPExtensions.h (score=0.4904) ； #3 [背景参考 · C#] refs/history/diff-match-patch/csharp/DiffMatchPatch.cs (score=0.4565) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-py-zxcvbn-l2 (L2) | time_estimates (zxcvbn/time_estimates.py · Python) | TypeScript → Python | #1 [★跨语言真值 · TypeScript] refs/js/zxcvbn_time_estimates_ref.js (score=0.8475) ； #2 [◆同项目参考 · Python] zxcvbn/__init__.py (score=0.7227) ； #3 [◆同项目参考 · Python] zxcvbn/scoring.py (score=0.5742) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-py-zxcvbn-l2 (L2) | feedback (zxcvbn/feedback.py · Python) | Python → Python | #1 [◆同项目参考 · Python] zxcvbn/__init__.py (score=1) ； #2 [◆同项目参考 · Python] zxcvbn/matching.py (score=0.9125) ； #3 [★跨语言真值 · TypeScript] refs/js/zxcvbn_feedback_ref.js (score=0.9125) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-js-ejs-l1 (L1) | utils (lib/cjs/utils.js · JavaScript) | TypeScript → JavaScript | #1 [◆同项目参考 · TypeScript] bench_checks/public_smoke.js (score=1) ； #2 [★跨语言真值 · Python] refs/python/ejs_utils_ref.py (score=1) ； #3 [背景参考 · Java] refs/history/diff-match-patch/java/src/name/fraser/neil/plaintext/diff_match_patch.java (score=0.5986) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-js-ejs-l1 (L1) | engine (lib/cjs/ejs.js · JavaScript) | TypeScript → JavaScript | #1 [◆同项目参考 · TypeScript] examples/express/app.js (score=0.825) ； #2 [★跨语言真值 · Go] refs/go/ejs_cli_and_compiler_ref.go (score=0.6921) ； #3 [★跨语言真值 · Python] refs/python/ejs_utils_ref.py (score=0.4485) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-js-ejs-l1 (L1) | cli (bin/cli.js · JavaScript) | C → JavaScript | #1 [背景参考 · C] refs/history/luajit/src/lib_jit.c (score=0.7058) ； #2 [◆同项目参考 · TypeScript] lib/cjs/parseargs.js (score=0.6927) ； #3 [★跨语言真值 · Python] refs/python/ejs_utils_ref.py (score=0.5048) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-js-ejs-l2 (L2) | utils (lib/cjs/utils.js · JavaScript) | Python → JavaScript | #1 [★跨语言真值 · Python] refs/python/ejs_utils_ref.py (score=1) ； #2 [◆同项目参考 · TypeScript] bench_checks/public_smoke.js (score=1) ； #3 [背景参考 · Java] refs/distractors/java/RedisCache.java (score=0.4684) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-js-ejs-l2 (L2) | engine (lib/cjs/ejs.js · JavaScript) | Go → JavaScript | #1 [★跨语言真值 · Go] refs/go/ejs_cli_and_compiler_ref.go (score=0.825) ； #2 [◆同项目参考 · TypeScript] examples/express/app.js (score=0.825) ； #3 [背景参考 · Go] refs/distractors/go/go_env_loader.go (score=0.4386) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-go-gobreaker-l1 (L1) | counter (v2/counter.go · Go) | Java → Go | #1 [★跨语言真值 · Java] refs/java/RollingCountsRef.java (score=1) ； #2 [◆同项目参考 · Go] gobreaker.go (score=1) ； #3 [背景参考 · C] refs/history/luajit/src/lj_snap.h (score=0.2517) | ✓ 命中跨语言真值 / 含干扰项 |
| poly-go-gobreaker-l1 (L1) | breaker (v2/gobreaker.go · Go) | Go → Go | #1 [◆同项目参考 · Go] gobreaker.go (score=0.9458) ； #2 [★跨语言真值 · Python] refs/python/distributed_gobreaker_ref.py (score=0.7859) ； #3 [★跨语言真值 · Java] refs/java/RollingCountsRef.java (score=0.7807) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-go-gobreaker-l1 (L1) | twostep (v2/twostep_gobreaker.go · Go) | Go → Go | #1 [◆同项目参考 · Go] gobreaker.go (score=0.9187) ； #2 [★跨语言真值 · Python] refs/python/distributed_gobreaker_ref.py (score=0.8463) ； #3 [◆同项目参考 · Go] example/http_breaker.go (score=0.6766) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-go-gobreaker-l1 (L1) | distributed (v2/distributed_gobreaker.go · Go) | Go → Go | #1 [◆同项目参考 · Go] gobreaker.go (score=0.8643) ； #2 [★跨语言真值 · Python] refs/python/distributed_gobreaker_ref.py (score=0.8532) ； #3 [◆同项目参考 · Go] v2/redis/store.go (score=0.8289) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-go-gobreaker-l2 (L2) | counter (v2/counter.go · Go) | Go → Go | #1 [◆同项目参考 · Go] gobreaker.go (score=0.9125) ； #2 [◆同项目参考 · Go] v2/gobreaker.go (score=0.9125) ； #3 [★跨语言真值 · Java] refs/java/RollingCountsRef.java (score=0.9125) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |
| poly-go-gobreaker-l2 (L2) | distributed (v2/distributed_gobreaker.go · Go) | Go → Go | #1 [◆同项目参考 · Go] v2/redis/store.go (score=0.8508) ； #2 [★跨语言真值 · Python] refs/python/distributed_gobreaker_ref.py (score=0.7457) ； #3 [◆同项目参考 · Go] gobreaker.go (score=0.7137) | ✓ 命中跨语言真值 / ✓ 0 干扰噪声 |

## 五、免 Docker 宿主机五语言原生沙箱与外部黑盒验收体系

由于宿主机无需依赖 Docker Desktop 守护进程即可高速执行评测，本套件通过 Docker Registry HTTP API v2 直接拉取并提取了 PolyCodeEval 官方镜像层数据集（err404notfound/polycodeeval-datasets-{cpp,java,python,javascript,go}:latest），并构建了完全在系统临时目录（os.tmpdir()）中编译与运行的五语言原生测试驱动（src/polycodeeval/assets/driver.mjs）：

| 语言 | 代表工程 | 宿主机工具链与离线依赖 | 分模块检查项 (Check IDs) | 黑盒与端到端验收机制 |
| --- | --- | --- | --- | --- |
| C++ (C++17) | cpp/logistic_system | MSYS2 MinGW-w64 g++ 14.2.0 + 预编译静态库 libgtest.a | account, expressage, logistics, cli | 3 组 GoogleTest 黑盒单元测试 + 7 组标准输入输出流（test000～test006）CLI 端到端持久化验收 |
| Java | java/idcenter | LibericaJDK 21 (javac/java) + JUnit 5 Console Standalone 1.10.2 | base62, idworker, sidworker, cli | JUnit Jupiter 分模块黑盒测试集（Base62BlackboxTest、IdWorkerBlackboxTest、SidWorkerTest、MainTest） |
| Python | python/zxcvbn | Miniconda Python 3.12 (-I -B 零字节码污染) + 本地 pytest 9.2.0 | matching, scoring, time_estimates, feedback | 6 组 PolyCodeEval 黑盒测试文件（test_basic / user_inputs / scoring / crack_times / feedback / edge_cases） |
| JavaScript | javascript/ejs | Node.js v26.0.0 + 内置轻量化 Mocha TDD Runner + 跨平台换行符归一化 | utils, engine, cli | utils 导出完备性测试 + render/compile/advanced 三大黑盒套件 + 子进程 CLI 模板渲染与 include 验收 |
| Go | go/gobreaker | Go 1.23.6 (GOPROXY=off) + 离线 _testify/assert 桩模块 + 持久化 GOCACHE | counter, breaker, twostep, distributed | v2 泛型熔断器黑盒测试 + 滚动窗口计数器、两阶段熔断器及分布式共享存储熔断器全量单测 |

## 六、模型实测交付结果（L1）

本轮模型为 gpt-6-luna。共完成 20 次试验，其中 5 次通过全部外部黑盒验收与 Git 交付完整性检查。平均耗时计入成功与失败的全部试验。

poly-js-ejs-l1 / sag2sql / gpt-6-luna 有 1 次请求未返回 token 用量。表中该方法的 token 合计为已报告的下限。

| 方法 | 总通过 | L1 (全项目骨架) 通过 | L2 (核心模块切片) 通过 | 平均用例得分 (部分得分) | 平均墙钟耗时 | 累计 Tokens | 公开价合计 ¥ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RECAST (ProjectPipeline) | 1/5 | 1/5 | — | 62.9% / 增益 62.8% (L1 62.9% / 增益 62.8% / L2 -) | 126.9s | 2,054,081 | ¥0.5050 |
| SAG2-SQLite (FTS5 + JEV) | 1/5 | 1/5 | — | 60.9% / 增益 60.6% (L1 60.9% / 增益 60.6% / L2 -) | 113.8s | ≥ 1,944,015 | ¥≥0.5075 |
| rawagent | 2/5 | 2/5 | — | 91.5% / 增益 91.4% (L1 91.5% / 增益 91.4% / L2 -) | 80.1s | 1,421,974 | ¥0.2613 |
| Codex CLI | 1/5 | 1/5 | — | 88.8% / 增益 88.6% (L1 88.8% / 增益 88.6% / L2 -) | 98.7s | 2,184,888 | ¥0.3540 |

## 证据与协议指纹

批次 poly-v4，RECAST 仓库版本 5ba062a437142a40f15bf886114ae6065a154b25，协议实现指纹 ee293eb10d0309f9d887495ad753211a88fde7c188b372ec7f9b4cfc0b96cd0a，验证时间 2026-11-11T01:01:19.872Z。

[PolyCodeEval 论文 (arXiv:2610.11618)](https://arxiv.org/abs/2610.11618) · [PolyCodeEval 官方仓库](https://github.com/PolyCodeEval/PolyCodeEval) · [C++: logistic_system](https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/cpp/logistic_system) · [Java: idcenter](https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/java/idcenter) · [Python: zxcvbn](https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/python/zxcvbn) · [JavaScript: ejs](https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/javascript/ejs) · [Go: gobreaker](https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/go/gobreaker)
