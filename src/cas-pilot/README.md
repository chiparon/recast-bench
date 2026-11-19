# SymPy 符号计算引擎重建

分发 [cas-reconstruction-v1.zip](../../repro/cas-reconstruction-v1.zip) 给解题方。解压后从 `target/TASK.md` 开始，`target/writable.json` 是允许编辑的路径，`history/` 可以按文件检索。目标实现是 Python，历史实现涵盖 C、Java、Julia 和 Common Lisp。固定的 SymPy 1.14.0 提供参考解和验收语义。[上游源码](https://github.com/sympy/sympy/tree/16fa855354eb7bcabd3fe10993841e03b1382692) · [三种构题路线比较](DESIGN.md)

## 题目规模

| 项目 | 实测 |
|---|---:|
| 实际挖去的参考实现 | 108,059 行 |
| 对应的函数或方法体 | 11,930 |
| 可写的生产文件 | 354 |
| 功能族 | 15 |
| 分发的历史生产源文件 | 3,897 |
| 分发的历史物理行／非空行 | 792,809／671,472 |

构建器用 AST 定位函数体，以原始 UTF-8 源码偏移进行替换。每个被移除的片段按含代码 token 的物理行计数，嵌套函数体合并到外层一次计数。统计排除空白、注释、文档字符串、测试、包初始化文件和保留的接口。多行字符串按 token 起始行计。每个缺失函数体插入一条占位语句，扣掉这些占位语句，差额约为 96,129 行。冻结构建保留了 `import sympy` 运行时需要的实现，空骨架仍可正常导入和定位行为失败。[逐族统计和验收结果](../../results/cas-pilot.json)

历史部分对带版本与摘要的归档按功能目录或文件筛选。FLINT 提供多项式和精确算术，JAS 提供 Gröbner 基与有理积分，AbstractAlgebra.jl 提供矩阵与形式级数，Maxima 提供化简、积分、求解和输出。非空行数包含历史源码中的注释与文档。功能与参考文件的对应关系可用于后续检索评估。[版本与功能对应表](history-lock.json) · [逐仓规模和摘要](history-evidence.json)

## 验收证据

| 输入 | 公开探针 | 隔离在题包外的上游回归 |
|---|---:|---:|
| 原始骨架 | 0 / 15 | 4 / 897 |
| 只往骨架写回 354 个允许文件后 | 15 / 15 | 897 / 897 |

每个功能族在总分中有相同权重，族内取通过比例。897 项来自 136 个固定上游测试模块。逐次只挖空一个功能族，其余功能保持参考实现，15 次均可导入，均在本族公开探针上失分。[逐族消融](../../results/cas-pilot-ablation.json)

在参考解上运行这 897 项，CPython 实际进入 5,295 个被挖空的函数体，在被挖空的代码中记录到 46,844 个不同源码行的 `LINE` 事件。多行表达式可能只有一个事件。由此能证明被挖去的参考代码规模，也能看到快速评分的覆盖边界。模型完成任务实际需要的输出量取决于算法选择和行为覆盖。上游代码和测试公开，仍可能有训练数据重合。[逐族执行触达](../../results/cas-pilot-reach.json)

完整原生回归入口另行处理 15 个包的 320 份测试文件，支持上游 fixture、慢测和按文件分片。原版成功收集 7,698 项用例，并完整执行了 sets。sets 的 gold 结果为 216 passed、7 xfailed、1 xpassed；空骨架在上游初始化打印器时触发 TODO。calculus 整包在 240 秒限时下超时。完整 15 包执行耗时和成功率待实测。[原生回归实测](../../results/cas-pilot-upstream.json)

## 接入 Poly runner 的历史对照

[首轮配对结果、逐族得分和来源分析](../../results/cas-pair-v2.md)

使用 `bench:poly --task cas-reconstruction-v1` 调度同一 rawagent 工具循环的两份独立快照。选手在两组都能分页读目标、查询当前源码、按当前文件哈希编辑 354 个允许文件、编译和运行公开检查。有历史组通过 SQLite FTS5 按 BM25 排序检索整份跨语言源码，每条命中包含实际片段；无历史组使用相同工具和空索引。这个入口测量按需全文检索。生产 SAG2 的结构检索是另一种执行方式。

检查搜到的源码时，先区分运行器的四个固定探针、模型主动收到的搜索结果，以及随后单独打开、引用或改写的实现。按功能族计分使用 897 项固定私有回归；LoC 计数取最终答卷，相对 starter 统计新增 Python 代码与其中落在原 TODO 函数体的行数。单对结果可定位案例，估计稳定增益需要重复采样。

在已准备好题包的 Windows bench 根目录运行。Docker 只读挂载待测目标和检查脚本，禁用网络；私有工作进程从标准输入接收所选测试。固定 stdout 的编码以复现冻结时的 SymPy 初始化分支。首次构建镜像先收集纯 Python wheel，构建阶段可以离线。

```powershell
$py = "work/cas-pilot/runtime/Scripts/python.exe"
$ctx = "work/cas-pilot/image"
New-Item -ItemType Directory -Force $ctx | Out-Null
& $py -m pip download --only-binary=:all: --no-deps -r src/cas-pilot/requirements.txt -d $ctx
Copy-Item src/cas-pilot/Dockerfile $ctx
docker build --network none -t recast-cas:py312-v1 $ctx
npm run bench:poly -- --task cas-reconstruction-v1 --batch cas-pair-v2 --controls
npm run bench:poly -- --task cas-reconstruction-v1 --model gpt-6-luna --batch cas-pair-v2
& $py -B src/cas-pilot/compare.py cas-pair-v2 gpt-6-luna
```

每个新批次会先校验历史源码和目标文件摘要、四仓检索探针，以及原版和空骨架逐族的公开／私有分数。相同批次复用终态答卷，新的独立试验请换批次名。

## 逐功能族交付与 SAG2

[配对实验结果](../../results/cas-family-v1.md) · [上轮提前交付的原因](finish-diagnosis.md)

`--granularity family` 将同一题拆为 15 个有序阶段。每个实验条件维护一份累积答卷，每族启动一次同模型的新会话，给出该族的职责、文件清单和公开行为。模型可以修改其他可写文件以恢复依赖。第一次申请交接且公开测试失败时，runner 将失败回送一次以便修复。再次交接时保留部分成果，测试并记录检查点，然后派发下一族。末尾对整份答卷重新计分。各阶段开始和结束的私有测试仅供实验端统计。

历史组调用产品的 `searchModulesWithSag2`，使用 SQLite BM25、结构 JEV 和最多两跳的检索。每族用公开的功能描述查 top 3，将真实源码片段放入模型起始上下文，模型也可继续查询和读取来源。索引由真实文件路径、源码片段和从声明提取的名称构成，每个文件对应一个模块。Julia 和 Common Lisp 注册为只读来源语言。无历史组拿到相同职责、测试和工具，历史查询返回空。

```powershell
npm run bench:poly -- --task cas-reconstruction-v1 --granularity family --model gpt-6-luna --batch cas-family-v1
& work/cas-pilot/runtime/Scripts/python.exe -B src/cas-pilot/compare.py cas-family-v1 gpt-6-luna
```

`sag2.json` 保留每族查询和返回原文，`result.json` 记录该族实施前后分数以及 Git 检查点，归档中包含工具轨迹、阶段判分与最终补丁。模型直接获得候选、主动读取文件、编辑时声明引用、行为测试改善是四种不同证据。

## 使用与复现

在 recast-bench 根目录执行。构建端使用 CPython 3.12，首次准备需要网络以取得固定源码；选手端运行公开探针只需要 mpmath。ZIP 的 SHA-256 为 `bc694670e67d83f7ccd82f3eee3294b7c991bc8f7f42a789ddf56daf13f0d39a`。给模型的文件系统根目录应设为独立解压目录，只读挂载历史，禁用网络；评分器、原始归档、gold 与工作区凭据留在评测端。这里的进程级路径校验用于验证本地受信对照，实际评测外部提交还需要独立沙箱。

```powershell
python -m venv work/cas-pilot/runtime
$py = "work/cas-pilot/runtime/Scripts/python.exe"
& $py -m pip install -r src/cas-pilot/requirements.txt
& $py -B src/cas-pilot/prepare.py
& $py -B src/cas-pilot/history.py
& $py -B src/cas-pilot/task.py pack
```

这组构建命令从新的输出目录开始。当前工作区已经准备好，可直接运行下面的命令。只向选手分发 ZIP。工作完成后将答卷的 `target/` 交给评分器，评分器校验文件清单和只读文件，再执行功能检查。保留 `-B` 可避免把临时字节码写入提交树。

```powershell
$py = "work/cas-pilot/runtime/Scripts/python.exe"
& $py -B work/cas-pilot/public/target/smoke.py work/cas-pilot/public/target
& $py -B src/cas-pilot/task.py grade work/cas-pilot/public/target --suite private
& $py -B src/cas-pilot/controls.py --json results/cas-pilot.json
& $py -B src/cas-pilot/ablate.py --json results/cas-pilot-ablation.json
& $py -B src/cas-pilot/upstream.py work/cas-pilot/private/golden --packages sets --timeout 180
```

空骨架的两条评分命令应返回非零。复测覆盖时给每次试验一个新的 trace 目录，再从 gold 坐标统计与挖空片段的交集。

```powershell
$trace = Join-Path $PWD ("work/cas-pilot/private/trace-" + [guid]::NewGuid())
$env:CAS_PILOT_COVERAGE_DIR = $trace
& $py -B src/cas-pilot/grade.py work/cas-pilot/private/golden --suite private
Remove-Item Env:CAS_PILOT_COVERAGE_DIR
& $py -B src/cas-pilot/reach.py work/cas-pilot/private/golden work/cas-pilot/private/freeze.json $trace results/cas-pilot-reach.json
```
