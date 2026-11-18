# NL2Repo 骨架重建配对实验

新分支：`codex/nl2repo-bench`。这是从 NL2Repo 原项目挖空实现的独立实验，比较 RECAST 项目流水线与原生 Codex CLI 的项目测试通过率。

[首轮配对结果](results/nl2repo-nl2repo-v1.md) · [选手输入 ZIP](repro/nl2repo-v1-inputs.zip) · [准备状态与实测基线](results/nl2repo-readiness.md) · [输入清单](results/nl2repo-inputs.json) · [来源锁](src/nl2repo/upstream-lock.json)

首轮使用 `gpt-6-luna`、每题每组 160,000 个已报告 Token 停止阈值，每方法每题采样一次。五项目等权平均通过率为 **RECAST 0.14% / Codex 2.20%**；10 次均因 Token 阈值终止，完整交付均为 0/5。这反映本轮预算、严格声明骨架、空历史库及逐文件调度条件下的表现。逐题结果、实际用量和生成代码见报告与证据归档。

## 项目与来源

[NL2Repo 官方仓库](https://github.com/multimodal-art-projection/NL2RepoBench) 固定在 `781a1da1ee41fb8edb0bed22f586d69111610edf`。需求来自其 `test_files/<project>/start.md`，原项目与回归测试从官方 GHCR 镜像的原始源码 COPY 层恢复；镜像摘要、层摘要及源码目录均已锁定。镜像后续层删除了原项目，因此构题器直接下载已锁定的源码层，不要求 Docker Desktop 正常运行。

| 项目 | 生产 Python 文件 | 原生产包物理行 | 官方标注测试数 |
|---|---:|---:|---:|
| sqlparse | 21 | 4,023 | 461 |
| Rich-Click | 20 | 6,785 | 145 |
| DeepDiff | 16 | 8,127 | 970 |
| Boltons | 30 | 17,005 | 423 |
| Jinja | 25 | 14,351 | 911 |

行数包含注释和空行，不包含测试。测试数是官方目录元数据，实际评分分母由运行环境中的原项目基线确定。测试使用锁定源码层中的原始回归套件。

NL2Repo 原版从空目录生成项目。本实验提供声明骨架，成绩应标为 **NL2Repo declaration-skeleton variant**，不能直接当作原版排行榜分数。

## 两组共用的输入

每题提供同一份 `TASK.md`、分段需求、`modules.json`、生产文件骨架、静态打包配置、依赖要求、许可证及公开检查。需求按顺序拆成不超过约 24,000 字符的段落，避免超过产品单文件读取上限；拼接后等于完整的修订版上游需求。模块清单控制在产品项目需求的 8,000 字符限制内。

骨架用 AST 保留函数名、参数、类型注解和类声明；移除原始导入、继承、装饰器、函数体、模块执行逻辑、常量值与数据表。函数体统一抛出 `NotImplementedError`，常量仅保留名字并置为 `...`，默认参数值也置为 `...`。解题方需要重建这些部分。原项目的 `.pyi` 接口声明与 `py.typed` 类型标记作为只读接口资料保留，确保类型接口回归也能执行。打包配置固定，不执行动态版本读取。完整原实现、Git 历史和回归测试不进入选手 ZIP。

DeepDiff 需求中的 `deepdiff==8.5.0 (core library)` 自依赖已删除，修订次数记录在清单中。测试运行环境只安装依赖，不安装目标答案包。两组外部历史参考库均为空；这一版本衡量项目组织与实现能力，不衡量有历史语料时的检索增益。

两组可读取的文件、允许编辑的生产 `.py` 文件、模块职责和公开检查相同。RECAST 使用现有产品的 `ProjectPipeline` 与 `WorkspaceTranslationRuntime`；Codex 使用实际 CLI 的 `app-server`，通过受限的读写、编译和测试工具操作同一文件范围，不使用另写的 raw-agent 循环。每次方法运行从同一输入创建独立快照。当前公共清单未提供依赖边，RECAST 按文件顺序派发模块，末尾集成；Codex 自主安排项目工作。

## 配对协议与判分

- 模型必须用 `--model` 明确指定，两组推理等级均为 `low`。默认每项目、每方法 160,000 个供应商报告 Token、3,600 秒执行预算，单响应输出上限 8,192。Token 阈值在响应返回后检查，最后一次请求的输入可能造成超额，记录实际用量；不会截断账目。
- 每个项目在两组都运行一次，默认共 10 次；`--repeats` 增加独立重复。同一项目串行配对，按项目和重复编号交替方法顺序。不同模型使用不同批次名。
- 原实现和空骨架先经过相同打包、依赖和测试命令。正式测试使用独立 Linux 容器，禁用网络、限制资源，只提供提交内容与评分器。公开检查使用另一份容器执行，里面没有私有回归测试和原实现。
- 基线必须正常结束且所有非跳过、非预期失败测试通过。冻结有效 node ID 后，生成项目的导入失败、收集失败、漏跑、运行中跳过以及超时均不能缩小分母。setup 或 teardown 失败的用例也不算通过。原基线排除的用例单独列出。
- 即使方法没有发布成功或预算耗尽，也保留并评分已有生产文件；方法错误、发布状态、测试通过率分别记录。评分基础设施错误标为未完成，不冒充模型得零分。
- 先计算每项目通过率，重复实验先在项目内平均，再对选定项目等权平均。完整五项目运行才是五项目均值；配对缺项时不出总体比较。
- 每批冻结输入摘要、控制实验、产品提交与工作区差异、bench 实现以及参数。批次不能混入修改后的实现；重跑独立实验请换批次名。运行锁防止同批并发重复计费。

公开检查包括语法和少量行为示例，不能替代完整回归。RECAST 的单模块阶段做语法检查，项目阶段做公开行为检查；Codex 能调用相同的项目检查。

## 使用

在本平台对应的 bench 根目录运行。现有 `launch.mjs` 会先检查相邻 `weichai` 的平台工作区；Windows 和 WSL 的 Node 依赖必须继续分开。控制器使用 Python 3.12（本机为 3.12.7），正式评分基础镜像为 `python:3.12.7-slim`，构建完成后记录实际镜像 ID 和完整依赖版本；它不是原 NL2Repo 各题不完全一致的 Python 环境。

```powershell
npm run prepare:nl2repo
npm run test:nl2repo

# 不调用模型、不产生推理费用的配对计划
npm run bench:nl2repo -- --plan --batch nl2repo-v1 --model gpt-6-luna

# 先验证原实现和骨架
npm run controls:nl2repo

# 先跑 sqlparse 配对；凭据从已有 bench 配置读取，不复制进选手工作区
node --env-file=../recast-bench/.env.local launch.mjs src/nl2repo/run.ts --batch nl2repo-sqlparse-v1 --project sqlparse --model gpt-6-luna --tokens 160000 --seconds 3600

# 五项目配对
node --env-file=../recast-bench/.env.local launch.mjs src/nl2repo/run.ts --batch nl2repo-v1 --model gpt-6-luna --tokens 160000 --seconds 3600
npm run report:nl2repo -- --batch nl2repo-v1
```

可用模型沿用已有 provider：`gpt-6-luna`、`gpt-6.1-sol`、`deepseek-flash`。`RECAST_CODEX_BIN` 可指定原生可执行文件；Windows npm 常见安装位置会自动解析。`RECAST_BENCH_PYTHON` 可指定控制器 Python。Codex 的临时配置在平台 RECAST 缓存目录内隔离，凭据通过现有代理传递。

本机 Docker Desktop 启动失败后，使用了 Ubuntu WSL 内的专用 Docker daemon。它的二进制、镜像和数据均位于 `/opt/recast/nl2repo-docker`，不使用 Docker Desktop 的数据卷。Node、Python 控制器和源码工具链仍在 Windows 工作区；WSL 只承载容器。首次启动脚本从 [Docker 官方静态发行目录](https://download.docker.com/linux/static/stable/x86_64/) 下载并校验 29.10.0。保持该前台进程运行，在另一个终端执行控制实验：

```powershell
wsl -d Ubuntu -u root -- bash /mnt/e/Eproject/recast-bench-nl2repo/src/nl2repo/setup-wsl-docker.sh
# 另一个终端
$env:RECAST_NL2REPO_DOCKER = 'wsl:Ubuntu'
npm run controls:nl2repo
```

网络受限时，可为启动命令传入本机代理的 `HTTPS_PROXY` / `HTTP_PROXY`；`RECAST_NL2REPO_BUILD_PROXY` 只用于镜像构建。正式检查和评分容器始终禁用网络。实际使用的 transport 与镜像 ID 已记录在每题控制结果中，模型运行时不依赖再次设置这些环境变量。

仅做本机诊断可用 `npm run controls:nl2repo -- --backend native`；此模式不具备容器隔离，不能替代正式控制实验，也不会解锁模型跑分。`npm run report:nl2repo` 输出准备状态。

生成内容位于：

- `work/nl2repo/inputs/`：五份公共输入；对应 ZIP 可直接分发给两组。
- `work/nl2repo/private/`：原项目和私有回归，只供构题与评分。
- `work/nl2repo/evaluations/`：逐次测试报告、安装日志与测试日志。
- `results/nl2repo-controls/`：基线有效 ID、跳过项和完整环境记录。
- `results/nl2repo/<batch>/`：冻结协议和逐方法结果；`work/nl2repo/trials/` 保存代码与调用轨迹。

## 本次准备状态

已生成 112 个生产文件的声明骨架与完整公共题包，并通过 8 项构题/判分单元测试和 5 项双快照一致性测试。五题 Linux 隔离基线均已通过：sqlparse 461、Rich-Click 139、DeepDiff 970、Boltons 423、Jinja 911。Rich-Click 实际收集 143 项，其中 4 项跳过；使用 139 个有效用例，不把目录中标注的 145 当作分母。空骨架控制与完整日志见准备报告。

Codex CLI 0.169.0 已完成真实 app-server 初始化与建会话预检，预检没有请求模型推理。正式配对采用用户选定的 `gpt-6-luna`，两组相同预算；正式比较以 `results/nl2repo/<batch>/` 的完整配对结果为准。
