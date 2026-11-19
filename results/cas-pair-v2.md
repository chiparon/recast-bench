# SymPy 符号计算重建，有历史与无历史各一次

两次请求均由供应商返回 `gpt-6-luna`，reasoning effort 为 low。两份独立 starter 相同，354 个文件可写，工具、任务指令和公开测试一致。每组用一个 rawagent 会话处理整题，两组都主动调用了 finish；运行器随后检查了最终答卷。模型自行选择要实现的功能，没有逐族派发或人为设定轮数上限。

| 指标 | 有历史 | 无历史 |
|---|---:|---:|
| 实际修改文件数 | 1 | 1 |
| 最终新增 Python 代码行 | 37 | 71 |
| 其中写入原 TODO 函数体 | 37 | 57 |
| 有新增代码的原函数定义数 | 17 | 25 |
| 官方公开探针 | 0/15 | 0/15 |
| 官方私有回归 | 4/897 | 4/897 |
| 各功能族等权平均 | 0.381% | 0.381% |
| API 请求数 | 16 | 14 |
| 输入 + 输出 tokens | 92,104 + 1,621 | 82,310 + 1,873 |
| 总 tokens（含缓存输入） | 93,725 | 84,183 |

代码行采用 starter 到终态的实际差异，排除空行、注释、文档字符串、pass 与未实现异常占位。表中第二种行数只计有新增代码的原 TODO 函数体。新增函数签名或对既有签名的改写可计入第一种行数。两个数字均描述写入量，功能正确性另由测试衡量。补丁与工具轨迹可回放。[归档](cas-pair-v2-evidence.json.gz) · [按文件和函数计数](cas-pair-v2-comparison.json)

## 逐族成绩

| 私有测试所属包 | 有历史 | 无历史 |
|---|---:|---:|
| polys | 1/96 | 1/96 |
| matrices | 0/92 | 0/92 |
| functions | 0/79 | 0/79 |
| integrals | 0/54 | 0/54 |
| solvers | 0/67 | 0/67 |
| simplify | 0/59 | 0/59 |
| series | 0/68 | 0/68 |
| concrete | 0/26 | 0/26 |
| ntheory | 1/40 | 1/40 |
| combinatorics | 0/48 | 0/48 |
| tensor | 0/56 | 0/56 |
| geometry | 0/44 | 0/44 |
| sets | 0/54 | 0/54 |
| calculus | 0/22 | 0/22 |
| printing | 2/92 | 2/92 |

两组通过的四个测试 ID 与空骨架完全相同。15 族公开探针两组全部为零。容器内先验校准结果为 gold 15/15、897/897，starter 0/15、4/897。

## 检索和行为差异

SQLite FTS5 按 36 行切块收录 FLINT 的 3,296 个 C 源文件／头文件、JAS 的 438 个 Java 文件、AbstractAlgebra.jl 的 122 个 Julia 文件以及 Maxima 的 41 个 Lisp 文件。源文件与冻结归档逐字节核对。四仓各有一个词项探针命中真实源码，无历史索引的相同查询均返回空。无仓名过滤时，`fmpz_poly_factor_zassenhaus`、`GroebnerBaseSeq`、`PuiseuxSeriesRing` 和 `risch` 的首条命中也分别属于对应仓。该实验检验 runner 的按需全文检索，没有运行 SAG2 结构化检索。[逐仓命中的原文](cas-pair-v2-comparison.json)

两组都从 `sympy/calculus/accumulationbounds.py` 入手。模型各主动检索一次历史。有历史组搜 `class accumulationbounds`，收到了五段 JAS Java 源码，包含复数、多项式商以及 Gröbner 基类；返回片段没有目标类名。模型随后没有打开历史文件，编辑记录也没有引用任何来源。此查询以 OR 合并词项，通用词 `class` 足以产生这些命中。无历史组的查询返回空。

正式评测结束后，仅针对双方都改过的类追加了 11 项诊断，未向模型开放。gold 11/11、starter 0/11、有历史 6/11、无历史 0/11。有历史答卷通过了有限端点、宽度与中点、退化区间、有限区间相加、取负和减标量。无历史答卷的构造器先访问 `is_comparable`，有限端点也会走到仍为空的复数运算实现而抛错。这个例子解释了为何写入行数更多却通过更少的直接行为探针。单次配对和这条检索轨迹不能将六项差异归因于 JAS；另外三库在模型本次查询中没有进入返回结果。[诊断程序](../src/cas-pilot/bounds_probe.py) · [诊断结果](cas-pair-v2-bounds.json)

## 运行条件与先导记录

最初的 cas-pair-v1 在 Linux 容器的 UTF-8 stdout 下触发另一条 SymPy 启动路径，空骨架导入时即命中 pretty printer TODO。先导两组共消耗 213,209 tokens，单列在[先导记录](cas-pair-v1-comparison.json)。正式 v2 将 stdout 调整为 CP1252，通过逐族正负对照后，从两份新 starter 重新运行。正式两组共消耗 177,908 tokens。Docker 在隔离网络、只读挂载下执行候选代码。每种条件采样一次。[复现命令](../src/cas-pilot/README.md)
