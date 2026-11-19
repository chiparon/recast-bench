# SymPy 逐功能族配对实验

两组均由同一模型完成。每组有 15 个依次派发的会话和一份累积答卷，每族先测当前状态，交接时再跑公开和私有回归，末尾重新运行整题。模型只看到公开反馈。每个条件各一个样本。

| 条件 | 逐族阶段数 | 改动文件 | 可解析文件新增代码行 | 其中原 TODO 内 | 公开通过 / 15 | 私有通过 / 897 | 模型请求 | 总 tokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 上轮整题／全文检索 | 0 | 1 | 37 | 37 | 0 | 4 | 16 | 93,725 |
| 上轮整题／无历史 | 0 | 1 | 71 | 57 | 0 | 4 | 14 | 84,183 |
| 逐族／SAG2 | 15 | 22 | 545 | 540 | 0 | 0 | 235 | 2,646,291 |
| 逐族／无历史 | 15 | 21 | 707 | 682 | 0 | 0 | 262 | 2,756,367 |

逐族／SAG2 有 2 个文件在终态无法解析。这些文件另有 142 个新增物理行，未计入上表代码行。

逐族／无历史 有 2 个文件在终态无法解析。这些文件另有 52 个新增物理行，未计入上表代码行。

## 逐族前后和整题复测

每格依次为该族开工前、交接后、全部阶段结束后通过的私有用例数，分母固定。后两列依次为交接时与终态的公开探针，每格按 SAG2／无历史排列。

| 私有用例所属族 | 用例数 | SAG2 前 → 后 → 最终 | 无历史 前 → 后 → 最终 | 交接公开 | 最终公开 |
|---|---:|---|---|---|---|
| ntheory | 40 | 1 → 1 → 0 | 1 → 1 → 0 | 0 / 1 | 0 / 0 |
| polys | 96 | 1 → 1 → 0 | 1 → 1 → 0 | 0 / 0 | 0 / 0 |
| functions | 79 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 1 | 0 / 0 |
| matrices | 92 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |
| sets | 54 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 1 | 0 / 0 |
| printing | 92 | 0 → 0 → 0 | 1 → 1 → 0 | 0 / 0 | 0 / 0 |
| simplify | 59 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |
| series | 68 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |
| concrete | 26 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |
| integrals | 54 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |
| solvers | 67 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |
| combinatorics | 48 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |
| tensor | 56 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |
| geometry | 44 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |
| calculus | 22 | 0 → 0 → 0 | 0 → 0 → 0 | 0 / 0 | 0 / 0 |

## 终态失败定位

两组在 polys 阶段都指出 `combinatorics/permutations.py` 的共享依赖阻断了公开检查，并在最终消息中把该文件认作不可写。该路径实际包含在 354 个可写文件中；提示列出的当前族主文件与完整写权限范围不同。两组在这个阶段均未改文件。

SAG2组有 15 个私有评分进程在执行测试列表前报错。首个错误为 `SyntaxError: unterminated triple-quoted string literal (detected at line 752)`。这些族按协议记零。

离线诊断在 SAG2 答卷副本中，将 `sympy/matrices/repmatrix.py`、`sympy/solvers/solvers.py` 恢复至该臂自身最近可解析的历史版本。没有追加模型调用。复测公开 0/15，私有 4/897。正式成绩使用原始答卷。[诊断结果](cas-family-v1-matched-syntax-control.json)

无历史组有 15 个私有评分进程在执行测试列表前报错。首个错误为 `SyntaxError: unterminated triple-quoted string literal (detected at line 364)`。这些族按协议记零。

离线诊断在 无历史 答卷副本中，将 `sympy/calculus/finite_diff.py`、`sympy/tensor/array/ndim_array.py` 恢复至该臂自身最近可解析的历史版本。没有追加模型调用。复测公开 3/15，私有 3/897。正式成绩使用原始答卷。[诊断结果](cas-family-v1-none-syntax-control.json)

## 交接时尚未解决的依赖

下表取每族交接时编译或公开验收的最内层报错文件。之后的功能族仍有机会修改这些依赖，最终状态见上表。

| 功能族 | SAG2 交接 | 无历史交接 |
|---|---|---|
| ntheory | `sympy/ntheory/factor_.py:837` | 通过 |
| polys | `sympy/combinatorics/permutations.py:835` | `sympy/combinatorics/permutations.py:835` |
| functions | `sympy/sets/sets.py:1499` | 通过 |
| matrices | `sympy/matrices/repmatrix.py:275` | `sympy/matrices/repmatrix.py:397` |
| sets | `sympy/matrices/repmatrix.py:275` | 通过 |
| printing | `sympy/matrices/repmatrix.py:275` | `sympy/functions/elementary/miscellaneous.py:147` |
| simplify | `sympy/matrices/repmatrix.py:275` | `sympy/sets/sets.py:1518` |
| series | `sympy/matrices/repmatrix.py:275` | `sympy/functions/elementary/exponential.py:210` |
| concrete | `sympy/matrices/repmatrix.py:275` | `sympy/concrete/summations.py:552` |
| integrals | `sympy/matrices/repmatrix.py:275` | `sympy/combinatorics/permutations.py:1395` |
| solvers | `sympy/matrices/repmatrix.py:275` | `sympy/combinatorics/permutations.py:1395` |
| combinatorics | `sympy/matrices/repmatrix.py:275` | `sympy/combinatorics/polyhedron.py:388` |
| tensor | `sympy/matrices/repmatrix.py:751` | `sympy/tensor/array/ndim_array.py:313` |
| geometry | `sympy/matrices/repmatrix.py:751` | `sympy/tensor/array/ndim_array.py:313` |
| calculus | `sympy/matrices/repmatrix.py:751` | `sympy/calculus/finite_diff.py:254` |

## SAG2 命中与实际使用

索引覆盖四库 3,897 个生产文件。SAG2 用原始源码片段及逐文件模块摘要执行 BM25 + JEV，最多两跳。文件适配器从源码提取声明名称作为桥接词，本轮索引未构建跨文件调用边。每族前三个候选的预览进入首条模型请求。下表记录模型后续自行打开的历史文件数，以及模型在写入操作中填写的来源；引用是模型自报。各族的完整查询、排序、源码预览和编辑顺序见证据归档。

| 功能族 | 首次查询实际跳数 | 首位候选 | 后续主动历史查询 | 单独打开历史文件数 | 编辑时声明的来源 |
|---|---:|---|---:|---:|---|
| ntheory | 2 | `history/jas/src/edu/jas/arith/PrimeInteger.java` | 0 | 0 | 无 |
| polys | 2 | `history/abstractalgebra/src/Rings.jl` | 1 | 0 | 无 |
| functions | 2 | `history/flint/src/gr_special/elementary.c` | 0 | 0 | 无 |
| matrices | 2 | `history/abstractalgebra/src/generic/SparsePoly.jl` | 0 | 0 | 无 |
| sets | 2 | `history/abstractalgebra/src/Groups.jl` | 0 | 0 | 无 |
| printing | 2 | `history/abstractalgebra/src/PrettyPrinting.jl` | 0 | 0 | 无 |
| simplify | 2 | `history/flint/src/fmpz_mod_poly/compose_mod_brent_kung_precomp_preinv.c` | 0 | 0 | 无 |
| series | 2 | `history/maxima/src/series.lisp` | 0 | 0 | 无 |
| concrete | 2 | `history/jas/src/edu/jas/application/GBAlgorithmBuilder.java` | 0 | 0 | 无 |
| integrals | 2 | `history/maxima/src/risch.lisp` | 0 | 0 | 无 |
| solvers | 2 | `history/abstractalgebra/src/generic/MatRing.jl` | 0 | 0 | 无 |
| combinatorics | 2 | `history/abstractalgebra/src/PermGroups.jl` | 0 | 0 | 无 |
| tensor | 2 | `history/maxima/share/tensor/itensor.lisp` | 0 | 0 | 无 |
| geometry | 2 | `history/flint/src/nmod_poly/berlekamp_massey.c` | 0 | 0 | 无 |
| calculus | 2 | `history/jas/src/edu/jas/ufd/SquarefreeFiniteFieldCharP.java` | 0 | 0 | 无 |

各仓在 45 个初始候选中的出现次数为 abstractalgebra 14，flint 9，jas 13，maxima 9。

两组都使用同一套拆分与失败反馈。逐族两臂可比较本轮是否接入 SAG2 时的观测差值；跨轮同时改变了调度和提示，有历史条件还更换了检索器。单对结果不能独立估计这些变化的因果贡献。

[逐族原始统计和测试 ID](cas-family-v1-comparison.json) · [完整归档含补丁和工具事件](cas-family-v1-evidence.json.gz) · [旧版退出原因](../src/cas-pilot/finish-diagnosis.md) · [复现说明](../src/cas-pilot/README.md)
