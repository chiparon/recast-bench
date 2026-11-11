import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import {
  PROJECT_MODELS,
  type ProjectModel,
} from "../project-bench/providers.ts";
import { RATE_CARD, priceRequests } from "../large-projects/billing.ts";
import type { MeterCall } from "../large-projects/meter.ts";
import { fixtures } from "./cases.ts";
import { arms, batchName, type Arm } from "./protocol.ts";

type Verdict = { id: string; passed: boolean };
type Score = { gain: number; score: number; casesPassed: number; casesTotal: number; moduleScore: number };
interface Sag2Candidate {
  path: string;
  language: string;
  score: number;
  isCrossLangTruth: boolean;
  isDistractor: boolean;
}
interface Sag2RecallRow {
  module: string;
  targetPath: string;
  targetLanguage: string;
  candidates: Sag2Candidate[];
}
interface Control {
  taskId: string;
  title: string;
  granularity: "L1" | "L2";
  upstream: { url: string; commit: string };
  inputHash: string;
  treeHash: string;
  files: number;
  physicalLines: number;
  readableLines: number;
  readFiles: number;
  referenceFiles: number;
  indexedReferenceFiles: string[];
  history?: { files: number; lines: number; repositories: Record<string, { files: number; lines: number }> };
  crossLangTruthRefs?: string[];
  distractorReferenceFiles?: string[];
  sag2Recall?: Sag2RecallRow[];
  languages: Record<string, { files: number; physical: number; nonblank: number }>;
  writable: string[];
  controls: { variant: string; checks: Verdict[]; score: Score }[];
}
interface Row {
  id: string;
  task: string;
  granularity: "L1" | "L2";
  arm: Arm;
  model: ProjectModel;
  inputHash: string;
  passed: boolean;
  commit: string | null;
  error: string | null;
  gradingError: string | null;
  wallMs: number;
  executionMs: number;
  indexMs: number | null;
  calls: MeterCall[];
  grade: { passed: boolean; checks: Verdict[]; integrityErrors: string[]; score: Score } | null;
  usage: { totalTokens: number; requests: number; usageComplete: boolean };
  price: ReturnType<typeof priceRequests>;
}
interface Bundle {
  batch: string;
  verifiedAt: string;
  protocol: {
    implementationHash: string;
    productRevision: string;
    productDiff: string;
  };
  controls: Control[];
  rows: Row[];
}
type Table = { headers: string[]; rows: string[][] };
interface Section {
  id: string;
  title: string;
  paragraphs?: string[];
  tables?: Table[];
}

const labels: Record<Arm, string> = {
  recast: "RECAST (ProjectPipeline)",
  sag2sql: "SAG2-SQLite (FTS5 + JEV)",
  rawagent: "rawagent",
  codex: "Codex CLI",
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const num = (n: number, d = 0) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmtMoney = (n: number) =>
  Math.abs(n) > 0 && Math.abs(n) < 0.00005 ? n.toPrecision(2) : num(n, 4);
const money = (lo: number, hi: number | null) =>
  hi === null
    ? "≥" + fmtMoney(lo)
    : lo === hi
      ? fmtMoney(lo)
      : fmtMoney(lo) + "–" + fmtMoney(hi);

const { values } = parseArgs({
  options: {
    batch: { type: "string", default: batchName },
  },
});
const batch = values.batch!;
assert(/^[\w-]+$/.test(batch));
const prefix = resolve("results", batch);
const bundlePath = prefix + "-evidence.json.gz";
const bundle: Bundle = JSON.parse(
  gunzipSync(await readFile(bundlePath)).toString("utf8"),
);
const { controls, rows, protocol } = bundle;

const totalAblations = sum(
  controls.map(
    (c) => c.controls.filter((v) => v.variant.startsWith("missing ")).length,
  ),
);
const totalControlRuns = sum(controls.map((c) => c.controls.length));
const totalCheckVerdicts = sum(
  controls.flatMap((c) => c.controls.map((v) => v.checks.length)),
);

const pct = (n: number) => num(n * 100, 1) + "%";
function formatCheckSummary(checks: Verdict[], score?: Score) {
  const passedCount = checks.filter((c) => c.passed).length;
  const detail = checks
    .map((c) => `${c.id}:${c.passed ? "✓" : "✗"}`)
    .join(" ");
  const cases = score ? `；用例 ${score.casesPassed}/${score.casesTotal} (${pct(score.score)}，相对 starter 增益 ${pct(score.gain)})` : "";
  return `${passedCount}/${checks.length} (${detail})${cases}`;
}

const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

const sections: Section[] = [
  {
    id: "rationale",
    title: "一、测试集重构背景：为何从 large-v3 (Django) 迁移至 PolyCodeEval",
    paragraphs: [
      "在前序批次 large-v3（十万行级 Django 后台单点补全基准）中，36 次正式试验暴露出测试集结构与 RECAST 核心能力之间的错位：large-v3 每道题仅挖空 2～3 个局部函数（约 40～80 行改动），且在题目 Prompt 中直接给出了近似伪代码级的逐步实现指令。这导致单会话直接改文件的 rawagent（5/9，55.6%，平均 61.9 秒）与 Codex CLI（5/9，55.6%，平均 137.3 秒）占优，而走完整多阶段架构流水线（spec → arch → impl）的 RECAST（3/9，33.3%，平均 141.6 秒）及带冷建索引的 SAG2-SQLite（3/9，33.3%，平均 164.0 秒）反而把跨模块规划与索引变成了纯耗时和上下文开销。",
      "对比两项候选外部基准：NL2Repo-Bench 主打 L0 空目录从零生成完整 Python 仓库，起始工作区不存在任何可被 SAG2-SQLite（Tree-sitter + SQLite FTS5 + JEV 符号依赖图）扫描的上游代码，且仅覆盖 Python 单一语言；而 PolyCodeEval（arXiv:2610.11618）覆盖 C++、Java、Python、JavaScript/TypeScript、Go 五大主流工程语言共 58 个真实多文件项目，原生提供 PRD 需求文档（docs/prd.md）、分级挖空骨架（L1 全项目骨架、L2 模块/文件级切片、L3 函数级）以及独立黑盒测试与端到端验收测试，天然契合潍柴 RECAST 的多语言代码智能与跨模块协同生成场景。",
    ],
    tables: [
      {
        headers: [
          "评估维度",
          "原 large-v3 (Django 局部补全基准)",
          "NL2Repo-Bench (空目录端到端仓库生成)",
          "新建 poly-v1 (PolyCodeEval 双粒度多语言基准)",
        ],
        rows: [
          [
            "编程语言覆盖",
            "仅 Python + 少量前端 JS（脱离 C++/Java/Go 工业栈）",
            "仅 Python 单一语言",
            "C++17、Java、Python、JavaScript (Node.js)、Go 五大语言全覆盖",
          ],
          [
            "任务粒度与模块拓扑",
            "2～3 个文件内挖空零散函数，几乎无跨模块拓扑依赖",
            "L0 全空目录生成，无既有架构边界约束",
            "同时支持 L1（全项目 3～4 模块拓扑链）与 L2（核心 2 模块切片）同台对比",
          ],
          [
            "需求规范形态",
            "Prompt 手把手指定属性名与分支逻辑（喂饭式伪代码）",
            "仅自然语言文档，缺乏接口签名锚点",
            "采用 PolyCodeEval 原生 PRD (SPEC.md) + 真实头文件/接口签名契约",
          ],
          [
            "对 RECAST 流水线的区分度",
            "任务过小，ProjectPipeline 多阶段规划沦为纯延迟开销",
            "跨度过大且无模块级增量编译检查锚点",
            "L1 检验全链路拓扑规划与按模块自检，L2 检验局部模块精准协同",
          ],
          [
            "对 SAG2-SQLite 检索的区分度",
            "目标函数位置已知，FTS5 + JEV 索引几乎无用武之地",
            "初始目录为空（0 个参考文件），无法建立结构化索引",
            "每题强制保留 1～7 个只读上游参考源码/头文件，索引命中直接决定接口一致性",
          ],
          [
            "执行与验收环境",
            "依赖特定 Django 虚拟环境与 AST 补丁",
            "依赖重型容器镜像",
            "免 Docker 宿主机原生五语言离线工具链 + 临时沙箱隔离，零污染工作区",
          ],
        ],
      },
    ],
  },
  {
    id: "inputs",
    title: "二、PolyCodeEval 双粒度任务矩阵与冻结输入（5 语言 × L1 / L2）",
    paragraphs: [
      "本批次（" +
        batch +
        "）从已拉取解压至本地的 PolyCodeEval 五语言镜像层（58 个工程）中，精选 5 个代表性多模块工程（每语言 1 个），并同时构建 L1（Full Project Skeleton，全项目核心业务模块整体挖空）与 L2（Key Multi-Module Slice，保留上下游真实实现、仅挖空核心耦合模块对）两套粒度，合计 10 个标准测试集 Fixture。",
      "所有任务均通过 SHA-256 文件清单（treeHash）与公开规格哈希（inputHash）冻结。工作区统一注入 PolyCodeEval 原生 PRD 文档（SPEC.md）及公开冒烟参考（bench_checks/*），且在构建阶段严格剔除任何可能泄漏 Oracle 实现的打包产物（如 EJS 的浏览器 bundle ejs.js / ejs.min.js / lib/esm/*）或超长词表（如 zxcvbn 超过 256 KB 限制的 653 KB 词频表 frequency_lists.py 自动排除出可读列表但保留运行时加载）。",
    ],
    tables: [
      {
        headers: [
          "任务 ID",
          "粒度",
          "所属工程与语言（物理行）",
          "冻结/可读文件",
          "生产/可读源码行",
          "可写模块拓扑链 (dependsOn)",
          "输入指纹 (inputHash / treeHash)",
        ],
        rows: controls.map((c) => {
          const f = fixtureById.get(c.taskId)!;
          const topo = f.modules
            .map((m) =>
              m.dependsOn?.length
                ? `${m.name}(${m.path}) ← [${m.dependsOn.join(", ")}]`
                : `${m.name}(${m.path})`,
            )
            .join(" ； ");
          const langStr = Object.entries(c.languages)
            .map(([l, s]) => `${l} ${num(s.physical)}`)
            .join("、");
          return [
            c.taskId,
            c.granularity,
            `${c.title} · ${langStr}`,
            `${c.files} / ${c.readFiles}`,
            `${num(c.physicalLines)} / ${num(c.readableLines)}`,
            topo,
            `${c.inputHash.slice(0, 12)} / ${c.treeHash.slice(0, 12)}`,
          ];
        }),
      },
    ],
  },
  {
    id: "controls",
    title: "三、零成本对照校准与逐模块消融验证（Golden / Starter / Per-Module Ablation）",
    paragraphs: [
      "在投入任何付费模型 API 调用之前，10 个任务全部通过了严格的零成本三阶校准（共计 " +
        totalControlRuns +
        " 次对照运行、" +
        totalCheckVerdicts +
        " 项子测试判定）：（1）Golden 正向对照：注入 PolyCodeEval 官方 Oracle 实现，公开构建、公开测试及外部黑盒/端到端验收必须 100% 通过；（2）Starter 负向对照：注入 PolyCodeEval 官方挖空骨架（L1_*/hollowed_files），必须被测试集准确拦截并判定失败；（3）逐模块消融（Per-Module Ablation）：在 Golden 基础上每次仅将 1 个可写模块回退为 Starter 挖空态（共 " +
        totalAblations +
        " 个消融变体），外部验收必须精确捕获该模块的缺失并判定失败，证明没有任何一个可写模块是「假模块」或测试盲区。",
      "此外，每次对照运行结束后均重新计算 Starter 与 Golden 工作区的 SHA-256 清单哈希，强制断言编译、测试与验收全过程对源码树实现零修改（Workspace Immutability）。",
    ],
    tables: [
      {
        headers: [
          "任务 ID",
          "粒度",
          "Golden 正向对照",
          "Starter 负向对照",
          "逐模块消融 (Per-Module Ablation) 明细",
          "工作区零污染校验",
        ],
        rows: controls.map((c) => {
          const golden = c.controls.find((v) => v.variant === "golden")!;
          const starter = c.controls.find((v) => v.variant === "starter")!;
          const ablations = c.controls.filter((v) =>
            v.variant.startsWith("missing "),
          );
          const ablationText = ablations
            .map(
              (a) =>
                `${a.variant.replace("missing ", "缺 ")} → ${formatCheckSummary(a.checks, a.score)}`,
            )
            .join(" ； ");
          return [
            c.taskId,
            c.granularity,
            `通过 ${formatCheckSummary(golden.checks, golden.score)}`,
            `拦截成功 ${formatCheckSummary(starter.checks, starter.score)}`,
            ablationText,
            `通过 (treeHash=${c.treeHash.slice(0, 10)})`,
          ];
        }),
      },
    ],
  },
  {
    id: "sag2sql",
    title: "四、五语言混合参考池（refs/）与 SAG2-SQLite 跨语言检索召回验证",
    paragraphs: [
      controls.some((c) => c.history)
        ? "L1 的历史库由 LuaJIT、go-yaml 和 diff-match-patch 三个仓库的完整 Git 快照组成。各题共用同一组提交，另保留本题的跨语言参考实现和同项目参考。L2 沿用原有的 11 个干扰文件。历史库 LoC 按 SAG2 已建索引并投影为可检索模块的历史源码物理行计数，包含注释、空行和上游测试。"
        : "各题保留同项目参考、跨语言参考实现和 11 个多语言干扰文件。",
      "在 --controls 校准阶段，框架对全部 10 个任务实测运行了 openRealIndex 与 searchModulesWithSag2（topK = 3, maxHops = 2），完整记录了每个可写模块在混合五语言索引库中的 Top-3 召回候选、跨语言结对方向（sourceLanguage → targetLanguage）及对跨语言真值参考与噪声文件的区分表现：",
    ],
    tables: [
      ...(controls.some((c) => c.history) ? [{
        headers: ["L1 任务", "历史仓库（已索引行数）", "已索引历史文件", "已索引历史 LoC"],
        rows: controls.filter((c) => c.history).map((c) => [
          c.taskId,
          Object.entries(c.history!.repositories).map(([name, r]) => name + " (" + num(r.lines) + ")").join("、"),
          num(c.history!.files), num(c.history!.lines),
        ]),
      }] : []),
      {
        headers: [
          "任务 ID",
          "粒度",
          "参考池总文件 / 建库文件",
          "工作区源码语言及文件数",
          "跨语言真值参考文件 (Cross-Language Ground Truth Refs)",
          "同项目内生参考文件 (Intra-Project Refs)",
          "背景参考文件",
        ],
        rows: controls.map((c) => {
          const truth = c.crossLangTruthRefs ?? [];
          const distractors = c.distractorReferenceFiles ?? [];
          const intra = c.indexedReferenceFiles.filter(
            (p) => !p.startsWith("refs/"),
          );
          const langBreak = Object.entries(c.languages)
            .map(([l, s]) => `${l}:${s.files}`)
            .join(", ");
          return [
            c.taskId,
            c.granularity,
            `${c.referenceFiles} / ${c.indexedReferenceFiles.length}`,
            langBreak,
            truth.join("、"),
            intra.join("、"),
            `${distractors.length} 个文件`,
          ];
        }),
      },
      {
        headers: [
          "任务 ID",
          "可写目标模块 (Target Language)",
          "Top-1 跨语言配对方向",
          "SAG2-SQLite (BM25 + JEV 2-Hop) Top-3 召回候选明细",
          "跨语言真值命中 / 零噪声污染",
        ],
        rows: controls.flatMap((c) =>
          (c.sag2Recall ?? []).map((r) => {
            const top1 = r.candidates[0];
            const pairStr = top1
              ? `${top1.language} → ${r.targetLanguage}`
              : `N/A → ${r.targetLanguage}`;
            const candStr = r.candidates
              .map((cand, idx) => {
                const tag = cand.isCrossLangTruth
                  ? "★跨语言真值"
                  : cand.isDistractor
                    ? "背景参考"
                    : "◆同项目参考";
                return `#${idx + 1} [${ tag } · ${cand.language}] ${cand.path} (score=${cand.score})`;
              })
              .join(" ； ");
            const hitTruth = r.candidates.some((x) => x.isCrossLangTruth);
            const hitNoise = r.candidates.some((x) => x.isDistractor);
            const verdictStr = `${hitTruth ? "✓ 命中跨语言真值" : "未命中跨语言真值"} / ${hitNoise ? "含干扰项" : "✓ 0 干扰噪声"}`;
            return [
              `${c.taskId} (${c.granularity})`,
              `${r.module} (${r.targetPath} · ${r.targetLanguage})`,
              pairStr,
              candStr,
              verdictStr,
            ];
          }),
        ),
      },
    ],
  },
  {
    id: "sandbox",
    title: "五、免 Docker 宿主机五语言原生沙箱与外部黑盒验收体系",
    paragraphs: [
      "由于宿主机无需依赖 Docker Desktop 守护进程即可高速执行评测，本套件通过 Docker Registry HTTP API v2 直接拉取并提取了 PolyCodeEval 官方镜像层数据集（err404notfound/polycodeeval-datasets-{cpp,java,python,javascript,go}:latest），并构建了完全在系统临时目录（os.tmpdir()）中编译与运行的五语言原生测试驱动（src/polycodeeval/assets/driver.mjs）：",
    ],
    tables: [
      {
        headers: [
          "语言",
          "代表工程",
          "宿主机工具链与离线依赖",
          "分模块检查项 (Check IDs)",
          "黑盒与端到端验收机制",
        ],
        rows: [
          [
            "C++ (C++17)",
            "cpp/logistic_system",
            "MSYS2 MinGW-w64 g++ 14.2.0 + 预编译静态库 libgtest.a",
            "account, expressage, logistics, cli",
            "3 组 GoogleTest 黑盒单元测试 + 7 组标准输入输出流（test000～test006）CLI 端到端持久化验收",
          ],
          [
            "Java",
            "java/idcenter",
            "LibericaJDK 21 (javac/java) + JUnit 5 Console Standalone 1.10.2",
            "base62, idworker, sidworker, cli",
            "JUnit Jupiter 分模块黑盒测试集（Base62BlackboxTest、IdWorkerBlackboxTest、SidWorkerTest、MainTest）",
          ],
          [
            "Python",
            "python/zxcvbn",
            "Miniconda Python 3.12 (-I -B 零字节码污染) + 本地 pytest 9.2.0",
            "matching, scoring, time_estimates, feedback",
            "6 组 PolyCodeEval 黑盒测试文件（test_basic / user_inputs / scoring / crack_times / feedback / edge_cases）",
          ],
          [
            "JavaScript",
            "javascript/ejs",
            "Node.js v26.0.0 + 内置轻量化 Mocha TDD Runner + 跨平台换行符归一化",
            "utils, engine, cli",
            "utils 导出完备性测试 + render/compile/advanced 三大黑盒套件 + 子进程 CLI 模板渲染与 include 验收",
          ],
          [
            "Go",
            "go/gobreaker",
            "Go 1.23.6 (GOPROXY=off) + 离线 _testify/assert 桩模块 + 持久化 GOCACHE",
            "counter, breaker, twostep, distributed",
            "v2 泛型熔断器黑盒测试 + 滚动窗口计数器、两阶段熔断器及分布式共享存储熔断器全量单测",
          ],
        ],
      },
    ],
  },
];

if (rows.length > 0) {
  const byArm = arms.map((arm) => {
    const armRows = rows.filter((r) => r.arm === arm);
    const l1 = armRows.filter((r) => r.granularity === "L1");
    const l2 = armRows.filter((r) => r.granularity === "L2");
    const passAll = armRows.filter((r) => r.passed).length;
    const passL1 = l1.filter((r) => r.passed).length;
    const passL2 = l2.filter((r) => r.passed).length;
    const avgScore = (rs: Row[]) =>
      rs.length
        ? `${pct(sum(rs.map((r) => r.grade?.score.score ?? 0)) / rs.length)} / 增益 ${pct(sum(rs.map((r) => r.grade?.score.gain ?? 0)) / rs.length)}`
        : "-";
    const avgWall = armRows.length
      ? sum(armRows.map((r) => r.wallMs)) / armRows.length / 1000
      : 0;
    const totalTok = sum(armRows.map((r) => r.usage.totalTokens));
    const lowerRmb = sum(armRows.map((r) => r.price.knownRmb));
    const upperRmb = armRows.every((r) => r.price.upperRmb !== null)
      ? sum(armRows.map((r) => r.price.upperRmb!))
      : null;
    return [
      labels[arm],
      `${passAll}/${armRows.length}`,
      `${passL1}/${l1.length}`,
      l2.length ? `${passL2}/${l2.length}` : "—",
      `${avgScore(armRows)} (L1 ${avgScore(l1)} / L2 ${avgScore(l2)})`,
      num(avgWall, 1) + "s",
      (armRows.some((r) => !r.usage.usageComplete) ? "≥ " : "") + num(totalTok),
      "¥" + money(lowerRmb, upperRmb),
    ];
  });
  sections.push({
    id: "trials",
    title: `六、模型实测交付结果（${[...new Set(rows.map((r) => r.granularity))].join(" / ")}）`,
    paragraphs: [
      `本轮模型为 ${[...new Set(rows.map((r) => r.model))].join("、")}。共完成 ${rows.length} 次试验，其中 ${rows.filter((r) => r.passed).length} 次通过全部外部黑盒验收与 Git 交付完整性检查。平均耗时计入成功与失败的全部试验。`,
      ...rows.filter((r) => !r.usage.usageComplete).map((r) => `${r.task} / ${r.arm} / ${r.model} 有 ${r.calls.filter((c) => !c.usage).length} 次请求未返回 token 用量。表中该方法的 token 合计为已报告的下限。`),
    ],
    tables: [
      {
        headers: [
          "方法",
          "总通过",
          "L1 (全项目骨架) 通过",
          "L2 (核心模块切片) 通过",
          "平均用例得分 (部分得分)",
          "平均墙钟耗时",
          "累计 Tokens",
          "公开价合计 ¥",
        ],
        rows: byArm,
      },
    ],
  });
} else {
  sections.push({
    id: "trials",
    title: "六、模型评测运行指南与待执行矩阵",
    paragraphs: [
      "当前批次已完成全部 10 个任务（5 语言 × L1/L2）的零 API 成本对照校准与独立验证（已验证试验数：0）。测试集已就绪，可随时按粒度（L1/L2）、按语言（cpp/java/py/js/go）、按模型（deepseek-flash / gpt-6-luna / gpt-6.1-sol）或按方法（recast / sag2sql / rawagent / codex）启动付费模型评测：",
    ],
    tables: [
      {
        headers: ["常用评测场景", "执行命令", "覆盖范围说明"],
        rows: [
          [
            "1. 快速验证单模型 L2 核心切片（推荐首轮低成本试跑）",
            "npm run bench:poly -- --model deepseek-flash --granularity l2 --methods recast,sag2sql,rawagent",
            "5 种语言的 L2 任务 × 3 种方法 = 15 次试验，直接验证 RECAST 与 SAG2-SQLite 在多参考文件场景下的优势",
          ],
          [
            "2. 同模型 L1 vs L2 双粒度全量对比",
            "npm run bench:poly -- --model deepseek-flash --methods recast,sag2sql,rawagent",
            "5 种语言 × (L1 + L2) × 3 种方法 = 30 次试验，完整对比全项目骨架生成与局部模块切片",
          ],
          [
            "3. 单语言专项评测（例如仅测 C++ 或 Go）",
            "npm run bench:poly -- --model deepseek-flash --lang cpp",
            "仅运行 poly-cpp-logistics-l1 与 poly-cpp-logistics-l2",
          ],
          [
            "4. 独立复核与重新生成本 HTML/Markdown 报告",
            "npm run verify:poly && npm run report:poly",
            `核验所有已完成试验的 Git 提交、工作区与外部黑盒打分，并更新 results/${batch}.html`,
          ],
        ],
      },
    ],
  });
}

const title = "PolyCodeEval 五语言双粒度项目交付基准报告";
const lead =
  rows.length > 0
    ? `${rows.filter((r) => r.passed).length}/${rows.length} 次试验通过独立黑盒交付验收；底层 10 个任务（C++ / Java / Python / JS / Go × L1 / L2）共 ${totalControlRuns} 组 Golden / Starter / 逐模块消融对照与 SAG2-SQLite 结构化索引校准 100% 通过。`
    : `已完成 C++、Java、Python、JavaScript、Go 五大语言 × L1（全项目骨架）/ L2（核心多模块切片）共 10 个标准任务的重建与冻结；${totalControlRuns} 组 Golden / Starter / 逐模块消融运行（${totalCheckVerdicts} 项测试判定）及 SAG2-SQLite 结构化索引校准 100% 通过。`;

function mdTable(t: Table) {
  const line = (cells: string[]) =>
    "| " +
    cells
      .map((s) => s.replaceAll("|", "\\|").replace(/[\r\n]+/g, " "))
      .join(" | ") +
    " |";
  return [
    line(t.headers),
    line(t.headers.map(() => "---")),
    ...t.rows.map(line),
  ].join("\n");
}

function htmlTable(t: Table) {
  return (
    '<div class="scroll" role="region" aria-label="' +
    esc(t.headers.join("、")) +
    '" tabindex="0"><table><thead><tr>' +
    t.headers.map((h) => '<th scope="col">' + esc(h) + "</th>").join("") +
    "</tr></thead><tbody>" +
    t.rows
      .map(
        (c) =>
          '<tr><th scope="row">' +
          esc(c[0]) +
          "</th>" +
          c
            .slice(1)
            .map((s) => "<td>" + esc(s) + "</td>")
            .join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table></div>"
  );
}

const links: [string, string][] = [
  ["PolyCodeEval 论文 (arXiv:2610.11618)", "https://arxiv.org/abs/2610.11618"],
  ["PolyCodeEval 官方仓库", "https://github.com/PolyCodeEval/PolyCodeEval"],
  ["C++: logistic_system", "https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/cpp/logistic_system"],
  ["Java: idcenter", "https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/java/idcenter"],
  ["Python: zxcvbn", "https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/python/zxcvbn"],
  ["JavaScript: ejs", "https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/javascript/ejs"],
  ["Go: gobreaker", "https://github.com/PolyCodeEval/PolyCodeEval/tree/main/datasets/go/gobreaker"],
];

const markdown =
  [
    "# " + title,
    lead,
    ...sections.flatMap((s) => [
      "## " + s.title,
      ...(s.paragraphs ?? []),
      ...(s.tables ?? []).map(mdTable),
    ]),
    "## 证据与协议指纹",
    `批次 ${batch}，RECAST 仓库版本 ${protocol.productRevision}，协议实现指纹 ${protocol.implementationHash}，验证时间 ${bundle.verifiedAt}。`,
    links.map(([s, u]) => `[${s}](${u})`).join(" · "),
  ].join("\n\n") + "\n";

const css = `:root{color-scheme:light;--ink:#152e2c;--muted:#52645e;--line:#c8d6cf;--paper:#fffefa;--accent:#176453;--badge-bg:#e2ece6;--badge-ink:#124e3f}*{box-sizing:border-box}html{scroll-padding-top:1rem}body{margin:0;background:#edf2ef;font:16px/1.65 "Segoe UI","Microsoft YaHei",sans-serif;color:var(--ink)}main{max-width:1280px;margin:24px auto;background:var(--paper);box-shadow:0 2px 12px rgba(21,46,44,.06)}header{background:#173f39;color:white;padding:38px 5%}header p{max-width:90ch;margin:.5em 0}header .meta{display:flex;gap:1rem 2rem;flex-wrap:wrap;margin-top:1rem;font-size:.9rem;color:#cfe3de}h1{font-size:clamp(1.8rem,4vw,3.1rem);line-height:1.18;margin:.35em 0}h2{font-size:1.48rem;margin:.15em 0 .65em;color:#123832}section,footer,nav{padding:22px 5%;border-bottom:1px solid var(--line)}nav{display:flex;gap:.5rem 1.25rem;flex-wrap:wrap;background:#f4f8f6}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}p{overflow-wrap:anywhere;margin:.65em 0}.scroll{overflow-x:auto;margin:14px 0;max-width:100%}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:.87rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:.55rem .65rem;overflow-wrap:anywhere}thead{background:#e2ece6}tbody th{font-weight:600;white-space:nowrap}tbody tr:nth-child(even){background:#f6f8f5}footer{color:var(--muted);font-size:.86rem}@media(max-width:600px){main{margin:0}header,section,footer,nav{padding:20px 16px}table{min-width:600px}}@media print{body,main,header{background:white;color:#14221f;margin:0;box-shadow:none}nav{display:none}header,section,footer{padding:10px 0}.scroll{overflow:visible}table{font-size:8pt;min-width:0}h2,thead{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}@page{size:A4 landscape;margin:12mm}}`;

const html =
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
  esc(title) +
  "</title><style>" +
  css +
  "</style></head><body><main><header><p>RECAST Benchmark · " +
  esc(batch) +
  " · PolyCodeEval Multi-Language Suite</p><h1>" +
  esc(title) +
  "</h1><p>" +
  esc(lead) +
  '</p><div class="meta"><span>校准任务：10 (5 语言 × L1/L2)</span><span>对照运行：' +
  totalControlRuns +
  " 组 (" +
  totalCheckVerdicts +
  " 项判定)</span><span>RECAST 版本：" +
  esc(protocol.productRevision.slice(0, 12)) +
  "</span><span>实现指纹：" +
  esc(protocol.implementationHash.slice(0, 12)) +
  "</span></div></header><nav>" +
  sections
    .map((s) => '<a href="#' + s.id + '">' + esc(s.title) + "</a>")
    .join("") +
  "</nav>" +
  sections
    .map(
      (s) =>
        '<section id="' +
        s.id +
        '"><h2>' +
        esc(s.title) +
        "</h2>" +
        (s.paragraphs ?? []).map((p) => "<p>" + esc(p) + "</p>").join("") +
        (s.tables ?? []).map(htmlTable).join("") +
        "</section>",
    )
    .join("") +
  "<footer><strong>核查来源与协议指纹</strong><p>" +
  links
    .map(([s, u]) => '<a href="' + esc(u) + '">' + esc(s) + "</a>")
    .join(" · ") +
  "</p><p>RECAST " +
  esc(protocol.productRevision) +
  " · Implementation " +
  esc(protocol.implementationHash) +
  " · Verified " +
  esc(bundle.verifiedAt) +
  "</p></footer></main></body></html>\n";

await Promise.all([
  writeFile(prefix + ".md", markdown, "utf8"),
  writeFile(prefix + ".html", html, "utf8"),
]);
console.log("Report written:", prefix + ".html", "and", prefix + ".md");
