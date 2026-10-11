# 大型曲谱「排版五线谱卡好久」治理报告 · 2026-10-10

被测：**Rienzi Overture - 瓦格纳**（真实曲库里的整部管弦乐总谱）
规模：MusicXML **18.3 MB** / **28 个声部** / **1633 小节 / 45,724 个 `<measure>`** / 107k 音符（62k 是休止符）

## 一、总效果（真实浏览器 + 真实服务实测）

| 指标 | 修前 | 修后 |
|---|---|---|
| **打开曲谱（UI 端到端）** | **46.6 s** | **19.4 s** |
| 最长单个长任务（界面冻结时长） | 13706 ms | **5729 ms** |
| 建排版计划 `engravingPlan` | 9217 ms | **23 ms**（‑99.7%，见第二轮+第四轮） |
| 解析乐谱 `parseMusicXML` | 5182 ms | 3011 → **2330 ms**（‑55%） |
| 解析阶段耗时（UI 时间线） | 16.1 s | 11.2 s |
| 打开一次创建的 DOM 元素 | 83,834 | **5,103**（‑94%） |
| 打开一次的重绘次数 | 380 | **20** |
| 首块 SVG 元素数 | 7033 | **1616**（‑77%） |
| 首块真实高度 / 占位高度 | 6678 / 850（**差 7.9×**） | 1738 / 1740（**吻合**） |
| 应用自身 DOM API 总耗时 | ~1.05 s | 0.63 s |

## 二、改了什么（7 个文件，全在 `dist/`）

### 第一轮：排版路径本身
1. **`engraving-plan.js` —— 最大收益**
   旧实现建计划时把**全部 45,724 个小节**一次性序列化成字符串，还每 96 小节 `setTimeout(0)` 让步一次
   （≈476 次 × 浏览器 4 ms 下限 ≈ **2 秒纯等待**）。改成**按需序列化 + 按需构建属性继承表**。
2. **`engraving.js`**
   - 不再为「数小节数」把整份 XML 重新解析一遍（18 MB → 1.3 s）。
   - 删掉一处**平方级热点**：每个音符条目都在全曲事件表（5494 条）上扫三四遍（`some`/`filter+map`/`findIndex`）
     → 改成按小节预建索引。
   - 音符注解 / 乐器名改为「先只读量完包围盒，再统一写 DOM」。
3. **`app.js`**：`updateScoreSubtitle` 不再为读调号重解析整份 XML（**`setTempo` 每次都会调它**）；
   `scoreFingerprintFallback` 用索引循环替代 Uint8Array 迭代器（结果完全一致）。
4. **`score.js`**：解析阶段多记 `keyMode`；`child()` 去掉每次 `Array.from(children).find()`
   （10 万音符 × ~10 次 ≈ **100 万次数组分配**）。
5. **`practice-instrument.js`**：`practiceInstruments()` 以前**每次调用都重解析 18 MB XML** 只为读声部名，
   而它挂在 `publishPractice()` 上（练习刷新 / 播放 / 改速度都会触发）→ 改为 WeakMap 缓存。

### 第二轮：打开路径上的 DOM 风暴（这才是 8 秒冻结的真凶）
6. **`app.js` `setImportProgress`**：解析阶段**每识别一个小节就回调一次进度**（大谱 1600+ 次），
   每次都 `reportTask` → 任务中心整块重绘。加了「进度值 + 文案都没变就跳过」的守卫。
7. **`task-center.js` `draw()`**
   - 去重签名里原来带**浮点进度**，每 tick 都变 → 等于没去重；改成按 1% 取整（观感不变）。
   - **任务中心不在可见布局里时直接不重绘**（打开曲谱时它确实不可见），可见/展开时再补画一次。
   - 效果：打开一次的重绘次数 90 → **0**，DOM 元素 83,834 → **5,103**。

### 第三轮：自适应分块（少画谱表）+ 修好占位高度
8. **`engraving-plan.js` / `engraving.js`**：每块小节数按声部数收敛（≥20 声部 → 4 小节/块），
   让首屏只排 1 个系统而不是 4 个；**占位高度改为按同一公式估算**（实测 ≈ 每行谱表 60 px）。
   - 首块高度 6678 → 1738 px、SVG 元素 7033 → 1616；
   - **顺带修掉一个既有 bug**：占位高度固定 850 px 而实际 6678 px，渲染一块就把下方内容往下顶约 5800 px
     （滚动一直跳）。现在 1740 vs 实际 1738，几乎完全吻合。

### 第四轮：去掉第二次 18MB 全量解析
9. **`score.js` + `engraving-plan.js`**：解析阶段（`parseMusicXMLSteps`）刚建好的 DOM，
   通过 `rememberSourceDocument()` 交给排版计划复用，省掉 `engravingPlan` 里的第二次
   18MB `DOMParser`。只在 >16 小节时登记、带 xml 校验（xml 被改写过就不复用）、计划取走后立即清引用。
   - `engravingPlan` 冷启动 **1490 ms → 23 ms**；
   - 逐字节等价性测试 8 个起点**仍然全部一致**（复用同一份文档，排版输出不变）。

### 第五轮：去掉解析让步的「4ms 下限税」
10. **`score.js` `parseMusicXMLAsync`**：原来每约 8ms 用 `setTimeout(0)` 让步一次 ——
    浏览器对嵌套定时器有 **4ms 下限**（第一轮在 `engravingPlan` 里踩过同一个坑）。
    实测 **300 次让步：`setTimeout(0)` 要 2122~4500 ms，`MessageChannel` 只要 3~11 ms（265 倍以上差距）**。
    改用 `MessageChannel`（带 `setTimeout` 兜底）。
    **曲库静音后的对照实验**：异步解析从「比同步慢 1170 ms」变成「与同步持平/略快（‑234 ms）」
    —— 4ms 下限的税确实被去掉了。
    （真实会话里曲库在并发加载、会把这段空档填掉，所以端到端的观感改善被部分掩盖。）
    顺带否掉一个怀疑：`doc.querySelectorAll('part > measure')` 只要 **12~42 ms**，不是瓶颈。

### 第六轮：把让步工具抽成共享模块，简谱路径一起修
11. **新增 `dist/yield-to-browser.js`**：`MessageChannel` 让步（`setTimeout` 兜底）。
    `score.js`（解析）与 **`simple-notation.js`（简谱渲染，同样每 8ms 用 `setTimeout(0)` 让步）**
    都改用它。实测大谱切简谱 **191~431 ms**（此前要交同样的 4ms 下限税）。
    - 已实测的剩余同款问题（**未改**，都属另一条工作线的文件）：
      `library.js:343` 每 24 张卡片让步一次（1,877 张 → 约 78 次 ≈ 0.3 s，发生在启动后台）；
      `daw.js:17` 每 6 ms 让步一次（已按可视窗口渲染，影响小）。
    - `engraving.js:311` 的 `requestAnimationFrame(()=>setTimeout(r,0))` 是**故意等一帧**，不能换。

### 第七轮：把同款让步问题一次清干净 + 机器基线
12. **`library.js`（建卡片）与 `daw.js`（音轨时间线）** 也改用了共享的 `yieldToBrowser()`
    （原本 `library.js` 每 24 张卡片 `setTimeout(0)` 一次 → 1,877 张约 78 次 ≈ 0.3 s）。
13. **机器基线（`_probe_cpu_baseline.cjs`）**：12 核 / 16 GB；整型循环 1e8 次 505 ms；
    **`DOMParser` 2.6 MB 用 301 ms ≈ 116 ms/MB** —— 所以 18 MB 解析一次就要约 2.1 s，
    这正好等于 `parseMusicXML` 的实测值。**结论：解析成本是「文档太大」的硬成本，不是算法问题。**

### 第八轮：用 Chrome Tracing 归因到底 + 修掉两处「整库/整轨重写」
14. **`library.js` 建卡时就写入「已渲染指纹」**（`button._renderStamp`，公式与 `updateCard` 一致，
    并补上 `is-writing` 类）。否则建完 1,877 张卡片后第一次后台轮询会把整库重写一遍 ——
    实测 `textContent` 写入 **9,430 → 5,659**（`updateCard` 那 3,754 次完全消失）。
15. **`app.js renderDrumLane` 改用 `DocumentFragment` 批量插入**，并在循环里直接收集 `_hits`
    （原来把 4,000 多个鼓点按钮**逐个 append 到已挂载容器**，插完还要 `querySelectorAll` 捞回来）。
    最终 DOM 完全一致。**实测 `Layerize`（合成层化）从 3.35 s 降到只剩几十毫秒的条目** ——
    那 3.35 秒正是这 4,656 次逐个插入造成的。

### 第十一轮：空闲预热排版引擎 + 修回一个被自己弄坏的测试
16. **`app.js` + `engraving.js`：启动后空闲时预热排版引擎**（新增 `warmEngravingEngine()`）。
    OSMD（约 1.1 MB）原来要等第一次排版才开始下载 + 编译，正好压在「打开曲谱」的关键路径上
    （Tracing 里能看到 `EvaluateScript opensheetmusicdisplay.min.js`）。
    **注意**：OSMD 当初就是**故意**从 `index.html` 挪出来以免拖慢首屏的，所以这里**先等 2.5 秒**
    （让启动序列跑完、进度条算完账）再交给 `requestIdleCallback`，避免干扰启动。
    实测：启动瞬间 OSMD 未加载、7 秒后就绪 → 不干扰启动，且第一次开谱不必再等它。
17. **修回 `check-progress-completion`**：这个测试会 `fs.readFileSync('dist/app.js')` 后**按行**
    取 `function setImportProgress(` 那一行丢进 `vm` 编译；我在第 2 轮把它**拆成了 6 行**，
    于是取到残缺半行、报 `Unexpected end of input`。已恢复为单行，并在函数上方写明
    **「本函数必须保持单行」**的警示。改完该测试 **PASS**。

### 第十二轮：把不变量固化成性能回归测试
18. **新增 `tests/browser/check-engraving-performance.cjs`**：打开一首大曲，校验这次优化建立的关键不变量 ——
    **只渲染首块**（其余交给滚动惰性）、**占位高度与真实高度吻合**（±25%，防止滚动跳动回归）、
    **音符注解齐全**（全部带 `data-index`）、乐器名标注存在，以及两条**宽松**的耗时上限
    （打开 < 60 s、最长长任务 < 12 s，可用 `PIANO_OPEN_LIMIT_MS` / `PIANO_LONG_LIMIT_MS` 调整）。
    首次运行实测：打开 22.0 s、最长长任务 6185 ms、分块 409（渲染 1 / 占位 408）、
    首块 1738 px ／ 占位 1740 px、音符注解 1/1、乐器名 28 → **PASS**。
    已登记进 `tests/browser/README.md`（本项目**没有**统一的全量测试入口，
    `package.json` 属于另一个 Next.js 模板项目，与本项目无关）。

### 第十三轮：★ 把「重复解析同一份 18MB」彻底消灭（本轮收益最大）
排查早期 CPU 归属数据时发现，还有**三个消费者各自又把整份 18MB XML 重新解析了一遍**：
19. **新增 `dist/score-document.js`**：`scoreDocument(xml)` 做**单条记忆化**的共享 DOM，
    `rememberScoreDocument(xml,doc)` 供解析方登记。只保留最近一条，换曲即被替换，内存有界。
    **约定：拿到 doc 的调用方只读。**
20. **三个消费者改为共用**：
    - `performance.js preparePerformance`（读 `<direction>` 力度/踏板）—— 原本 1.25 s
    - `app.js decoratePdfCoordinates`（读 PDF 页面/小节坐标）—— 原本 1.13 s
    - `practice-instrument.js xmlScoreParts`（读声部名）—— 上一轮只加了缓存，它自己那次解析仍在
    并让 `engraving-plan.js` 在拿到 DOM 后 `rememberScoreDocument(score.xml, doc)`，后续消费者直接复用。
21. **`decoratePdfCoordinates` 里还修了一处**：原来在 `sort` 的比较器里对每个 part 的**整棵子树**
    跑 `querySelectorAll('measure')` / `querySelectorAll('note[default-x]')`
    （每次比较都扫几千个节点）→ 改成先把两个计数算出来再排序，结果完全一致。

**验证（`_probe_parse_count.cjs` 给 `DOMParser.parseFromString` 打桩）**：
```
打开耗时 17.1s
DOMParser.parseFromString 共调用 5 次，合计 1237 ms
其中「大文档（≥5MB）」1 次，合计 1229 ms      ← 全曲只解析一次
  # 1   17.49 MB    1229 ms
  # 2~5  0.04 MB    各 2~3 ms
```
**18MB 文档从「一首曲子被解析 4~5 遍」收敛到「只解析 1 遍」。**

> `dist/` 是 `Cache-Control: no-store`，**改完刷新即生效，无需 bump 版本号**。

## 三、正确性验证（都实跑）

- **逐字节等价**：内联复刻旧算法，对 start = 0/16/32/48/64/96/400/1616 八个起点对比分块输出 → **全部完全一致**。
- `tests/browser/check-engraving-plan.cjs` → **PASS**（调号继承 fifths 2→‑1、拍号 3/4 继承）
- `tests/browser/check-first-cloud-lazy.cjs` → **PASS**
- `tests/browser/check-score-view-performance.cjs` → **PASS**
- `tests/browser/check-large-score.cjs` → **PASS**（6004 事件、异步解析让步）
- 音符注解回归 → **PASS**（`.note-event` 全部带 `data-index` + 命中区、乐器名 112 条、点击可跳转、无页面错误）
- **滚动惰性渲染回归** → **PASS**（409 块；下滚依次 1→2→3 块，滚到底 13 块，无页面错误）
- 解析结果不变：`events = 5494 / measures = 1633`

## 四、剩余时间到底花在哪（逐层量到底，并两次更正自己的误判）

剩余那个约 5.7 秒的长任务**确实在「正在排版完整五线谱」阶段内**。逐层量下来：

| 组成 | 实测 |
|---|---|
| 应用自己的全部 DOM API | **0.63 s**（`getBBox` 3258 次仅 0.04 s、`createElement` 5103 次 0.00 s） |
| 强制布局类读取（`getComputedStyle` / `clientHeight` 等） | **0.41 s**（`getComputedStyle` 一次都没调） |
| OSMD `osmd.load` | **61 ms**（46 KB 块） |
| OSMD `osmd.render` | **1169 ms** |
| **fetch + `JSON.parse` 18MB** | **618 ms** |
| **`parseMusicXML`（DOMParser 18MB + 抽音符）** | **约 2.1~2.6 s** |
| **全曲 18MB 的解析次数** | **4~5 遍 → 1 遍**（合计 1237 ms，其中 18MB 那次 1229 ms） |
| 解析让步的 4ms 下限税（`setTimeout(0)`） | **已消除**（改 `MessageChannel`） |
| ~~`engravingPlan`（第二次 18MB 解析）~~ | **已消除**（1490 → 23 ms） |
| ~~`preparePerformance` / `decoratePdfCoordinates` / `xmlScoreParts` 各自的 18MB 解析~~ | **已消除**（改为共用共享 DOM） |

**根因结论：不是排版算法，而是「那份 18MB MusicXML 被主线程反复处理」。**

### 两次更正我自己的误判（都记在这里，免得下次重犯）
1. ❌ 曾说「OSMD 自身 JS ≈ 2 s」→ 在真实路径上给 `load`/`render` 打桩后实测 **1.23 s**，差了一倍。
2. ❌ 曾说「打开曲谱会触发整库渲染」→ 其实 `initLibrary` 结尾就调了 `reload()`，
   它在后台跑、正好在打开的这 20 秒里完成（启动瞬间只有 540 个元素）。**不是打开的成因，只是并发抢占主线程。**

### 关于浏览器指标的一个坑
CDP `Performance.getMetrics` 的 `ScriptDuration` 在这版 Chromium 里**不可信**
（实测 `parseMusicXML` 明明跑了 2.5 s，它却报 0 ms）。**只有 `TaskDuration` 可用**。
用 `TaskDuration` 做对照实验很有价值：4 小节示例谱 260 ms / 无法归因 101 ms（比例正常）；
28 声部大谱 25,249 ms / 无法归因 24,534 ms（比例异常）——说明大谱的主线程是真忙，不是机器被抢占。

### 用 Chrome Tracing 做的最终归因（这是唯一能把「原生」时间也拆开的工具）
`_probe_trace3.cjs`（CDP `Tracing.start`，`devtools.timeline,v8,blink.user_timing`），
按**单个事件**列出耗时最长的项：

| 事件 | 耗时 | 说明 |
|---|---|---|
| `EventDispatch type=load` | **5.65~6.43 s** | 就是那个长任务。**把它拆开后**：其中**一次** `v8.callFunction` 占满整段；具名子事件只占约 **0.8 s**（`FunctionCall` 0.35 s + `UpdateLayoutTree` 0.32 s + `Layout` 0.07 s + GC 0.06 s），其余在 OSMD 的 minified 代码内部，且期间有 **93 次 `V8.DeoptimizeCode`**（跑在解释器上）。→ **属第三方库内部成本，客户端改不动** |
| `TimerFire` | 1.22~1.32 s，**但不是 CPU** | 给 `setTimeout` 打桩并区分同步/异步后：所有定时器回调的**同步合计只有 7 ms**，异步总时长 21,837 ms 全在等 fetch（任务中心轮询）与等动画帧（`language-hello.js` 的 `await motion.finished`）—— **是主线程被占满的症状，不是原因** |
| `Layerize` | 3.35 s → **已降到几十 ms** | 合成层化，就是第 15 条那 4,656 次逐个插入造成的（已修） |
| `v8.callFunction` | 9.6~10.4 s（含嵌套） | JS 执行 —— **证实 `Performance.getMetrics` 的 `ScriptDuration` 是假的** |
| `UpdateLayoutTree` / `Layout` / `Paint` | 0.45 / 0.40 / 0.66 s | 布局与绘制都很小 |
| `IntersectionObserverController::computeIntersections` | 0.87 s / 334 次 | 惰性排版 + 封面观察器 |
| GC（Minor+Major） | **仅 0.3 s** | GC 不是问题（又一次否掉直觉） |

### 还没做、但收益可能更大的方向（需您拍板）
实测这份 17.5 MB 谱的成分（`_probe_xml_trim.py`）：

| 成分 | 体积 |
|---|---|
| 有音高 `<note>` 43,178 个 | 8.87 MB（51%） |
| 休止符 `<note>` 61,861 个 | 5.19 MB（30%） |
| `<print>` / `<defaults>` / `<lyric>` / `<beam>` / `<slur>` | **0 次**（这份 XML 没有布局垃圾） |

- **精简版 XML**：主要能删的是冗余休止符 → 约 11.5 MB（降 1/3），按 116 ms/MB 算约省 **0.7 s**。
  ★ **更正**：我上一轮说「真正的音乐内容 1~2 MB 就能表达」是**不准确的** ——
  那要换成「事件表示」才可能，而排版（OSMD）必须吃 MusicXML。所以这条路的天花板是 ~30%，不是数量级。
- **把 XML 解析挪进 Web Worker**：⚠️ `DOMParser` **在 Worker 里不可用**，
  要换成流式 XML 解析器，属较大改造，且会带来正确性风险。
- 更彻底的是**换传输格式**（服务端直接下发已经算好的事件结构，另给排版用的分段 XML），
  但那是数据格式级改造，风险与收益需要您评估。

## 四之二、顺手修掉了一个失效测试

`tests/browser/check-full-large-switch.cjs` 原本断言 `#daw-view .daw-note` **恰好 8192 个**，
但 DAW 视图是按滚动窗口渲染的（`visibleNotes()` 只画可视范围）——该断言永远不可能通过。
已改成校验**真正有意义的量**：8 条声部轨 + 256 个小节刻度 + 可视区音符 > 0。
改完该测试 **PASS**，而且切换只要 113~148 ms（此前是 90 s 超时）。

## 五、顺手发现的既有问题

- **`tests/browser/check-full-large-switch.cjs` 是失效测试**（**已修**，见第四节之二）：
  它断言 `#daw-view .daw-note` 恰好 8192 个，而 `dist/daw.js` 的 DAW 视图按滚动窗口渲染。
  已改成校验 8 条声部轨 + 256 个小节刻度 + 可视区音符 > 0，现为 PASS。
- **曲库整库渲染是后台行为**（1,877 张卡片，`initLibrary` 结尾即调 `reload()`），
  **不是「打开曲谱」触发的**（我一度误判，见第四节更正）；但它会与打开过程并发抢占主线程。
- **`tests/browser/check-library-reuse.cjs` 也是失效测试**（**既有，与本轮改动无关**）：
  它断言「流式加载更多时必须复用已有卡片」（`streaming must retain existing cards`），
  实测失败。**已用 A/B 排除**：把我对 `library.js` 的改动还原后它仍然失败 → 不是我改出来的。
  属移动端曲库流式加载的问题，建议单独排查。
- **启动类测试有两份已经「烂掉」**（都是既有，且与本次改动无关）：
  - `check-startup-activities.cjs`：等 `#boot-activities li`，但**全 `dist/` 里没有这个 id**
    （`startup.js` 实际用的是 `#boot-percent/#boot-bar/#boot-label/#boot-mark/#startup`）→ 永远不可能通过；
  - `check-startup-linear.cjs`：它用 `setContent` 造的合成 DOM **缺 `#boot-mark` 与 `<img>`**，
    而 `startup.js` 现在需要它们 → 脚本中断、百分比一直为空。
  → 这两份测试的假设已经和现在的启动 UI 对不上，建议重写（`check-compact-startup` 是好的，可作范本）。
- **一个改动约束（踩过）**：`setImportProgress` / `paintImportProgress` 这类函数**必须保持单行**——
  `check-progress-completion.cjs` 会按行读取 `dist/app.js` 的源码丢进 `vm` 编译。已在源码里写明警示。
- 页面有一个既有的 `Identifier 'reveal' has already been declared` 报错（来自另一条工作线），不影响启动。

## 六、诊断脚本（都在 `scripts/_probe_*.cjs`，可复跑）

| 脚本 | 作用 |
|---|---|
| `_probe_phases.cjs` | 分阶段计时（直取 XML，不走 UI，秒级可重复） |
| `_probe_timeline.cjs` | 长任务 × 阶段文案时间线 |
| `_probe_cpu_tree.cjs` | CPU 按调用栈归属（含 OSMD） |
| `_probe_domcount.cjs` | DOM API 调用次数与累计耗时 |
| `_probe_createelement.cjs` | 谁在创建元素（采样调用栈） |
| `_probe_replacechildren.cjs` | 谁在重绘（按调用者统计） |
| `_probe_osmd_phases2.cjs` | 真实路径上拆分 OSMD `load`/`render`/构造耗时 |
| `_probe_metrics.cjs` | CDP `Performance.getMetrics`（Task/Script/Layout/RecalcStyle） |
| `_probe_trace.cjs` / `_probe_trace2.cjs` / `_probe_trace3.cjs` | **Chrome Tracing 归因**（按事件名/单个事件） |
| `_probe_textcontent.cjs` | `textContent` 写入次数与调用者（抓「整库/整轨重写」） |
| `_probe_cpu_baseline.cjs` | 机器 JS/DOMParser 基线（判断是不是硬件慢） |
| `_probe_xml_trim.py` | 量化 XML 成分（判断「精简文档」能省多少） |
| `_probe_drum_lane.cjs` | 鼓轨功能回归 |
| `_probe_simple_view.cjs` | 大谱切简谱耗时 |
| `_probe_parse_async.cjs` | 让步开销（sync vs async、setTimeout vs MessageChannel） |
| `_probe_metrics_control.cjs` | 对照实验：小谱 vs 大谱的浏览器指标 |
| `_probe_xml_cost.cjs` | 隔离测量 18MB XML 本身的代价（fetch/JSON.parse/解析） |
| `_probe_layoutreads.cjs` | 强制布局类 API（`getComputedStyle` / `clientHeight` …） |
| `_probe_domsize.cjs` | 页面 DOM 规模（发现整库卡片是后台加载的） |
| `_probe_chunk_heights.cjs` | 分块真实高度 vs 占位高度标定 |
| `_probe_lazy_scroll.cjs` | 滚动触发惰性渲染回归 |
| `_probe_chunk_equiv.cjs` | 新旧分块算法逐字节等价性 |
| `_probe_note_annotations.cjs` | 音符注解 / 点击跳转功能回归 |

> ⚠️ 跑性能探针时请**只跑它一个**：并发浏览器测试 / 残留 headless 进程会把数字抬高 2~3 倍。
