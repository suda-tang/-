# 乐谱精准编辑接入说明（2026-11-12）

把开源框架 **SeraEdit 1.0.0**（MIT，<https://github.com/Selancee/Sera/releases/tag/v1.0.0>）
的「语言引导 MusicXML 精准编辑」能力，嵌入本系统。补齐了此前 AI 对「移调 / 改音符 /
改时值 / 改拍号」一律如实拒答的空白。

## 一句话架构

浏览器 → `server.py` 新增 `/api/sera-edit/*` → `sera_bridge.py` 适配层 →
`sera_vendor/`（Sera 核心 43 个纯 Python 文件）→ 产出**独立修订 MusicXML** →
`app.js` 的 `ai-sera-replace-score` 换入内存谱面 → OSMD 重渲染。

**零新增 pip 依赖、零子进程、不需要 MuseScore / Electron。** Sera 核心的 import 闭包
实测只用标准库（不碰 fastapi / pydantic / music21）。

## 文件清单

| 文件 | 类型 | 作用 |
|---|---|---|
| `sera_vendor/` | 新增 43 py + `LICENSE-Sera.txt` | Sera v1.0.0 核心，**未改动上游一行**，可整目录升级 |
| `sera_bridge.py` | 新增 | 适配层：路径注入、中文指令、作用域自适应、非阻断校验、修订栈、错误翻译 |
| `server.py` | 改 3 行 | `/api/sera-edit/*` 路由 |
| `ai_workspace.py` | 改 4 处 | `SERA_EDITABLE_RE` / `SERA_OUT_OF_SCOPE_RE` / `sera_edit_plan()` / `allowed` 白名单 / 动作标签 |
| `dist/workspace-ai.js` | 改 2 处 | `KNOWN_TYPES` 加 `edit_score`；`action()` 加分发的 `ai-edit-score` |
| `dist/sera-edit.js` | 新增 | 前端「乐谱精准编辑」审查面板 + 三端点调用 + 撤销 |
| `dist/app.js` | 改 1 处 | `ai-sera-replace-score` 监听（parseMusicXML + setScore） |
| `dist/index.html` | 改 1 行 | 启动链引入 `sera-edit.js` |
| `scripts/check-sera-edit.py` | 新增 | 可重复运行的回归验证（临时端口，不碰 5173），含疑问句/否定句 + 多声部守恒 + 调号/拍号真改入谱守卫 |
| `scripts/check-sera-edit-ai.py` | 新增 | AI 对话 → `edit_score` → 提案面板 的浏览器 E2E（桩响应，不依赖模型） |
| `scripts/check-sera-edit-routing.py` | 新增 | 自然语言 → `edit_score` 路由回归（离线调 `fast_plan`，不依赖模型/5173），守住"用户顺口说法不被 1413 兜底误杀" |

回滚备份在 `.sites-runtime/sera-rollback/`（改动前 5 个文件的原样副本）。

## 端点（全部 POST，JSON）

- `/api/sera-edit/status` — 引擎探针
- `/api/sera-edit/preview` — `{xml, instruction, target_scope?}` → 提案（不落盘）
- `/api/sera-edit/apply` — `{session_id, source_xml, revised_xml, instruction}` → 存入修订栈
- `/api/sera-edit/undo` — `{session_id}` → 回退一层

## 两条不可动摇的安全底线

1. **原谱绝不覆盖**：所有编辑只生成独立修订，换的是内存中的当前谱面对象；
   不写云曲库、不写 `.sites-runtime/score-cache`、不改 `score.xml` 原文件。
2. **每次编辑可撤销**：`apply` 进修订栈，`undo` 逐层回退，最底层还原原始谱面。

## 关键设计决定（唐老师 2026-11-12 拍板）

**「取消校验、铺平障碍让 AI 能编辑」** 落地为：**校验照跑但一律不阻断**。

Sera 原生 `PatchTransaction` 有 10 层严格校验，对本系统真实 OMR 谱抽样 25 份有
21 份被 E02/E07/E08/E14（时值 / 和弦结构 / MusicXML 往返保真）回滚。这些多是
OMR 识谱本身的不规范，不是编辑造成的。因此适配层：

- 复用 Sera 的 `ScoreDocument` / `ScorePatch` / `apply_patch_operation` /
  `score_document_to_musicxml` 原语自行组装修订（**绕过** `PatchTransaction` 的阻断）；
- 独立调用 `PatchTransaction(dry_run=True)` 只取校验报告，把 E02/E07/E14 等
  翻译成中文作为 `warnings` 返回给前端展示，**不阻止编辑**；
- 只保留两条硬检查：修订结果必须是合法 XML、且满足 `dist/score.js` 的
  `parseMusicXML` 硬性要求（score-partwise、有效时值与音高）——否则宁可放弃，
  避免把坏谱塞进渲染器。

实测效果：25 份真实 OMR 谱中 24 份可编辑（唯一失败的是整谱无音符），
规范谱 100% 往返保真。

## 多声部 OMR 谱的「音符守恒」修复（2026-11-12 收尾）

**实测暴露的真问题**：真实 OMR 谱大量是多声部（如某谱 3 个 part / 5206 音符）。
Sera 的 `musicxml_to_score_document` 只保留**最后一个 part**（恰好 1029 音符），
若按旧方案把 Sera 的 `ScoreDocument` 再导出为 MusicXML，会**静默丢掉 2/3 谱面**
（backup / chord 等结构一并丢失），且往返不保真。早期验证只查了「音高改对没 /
保护区 / XML 合法」，**漏验了「音符总数守恒」**才没早发现。

**修复（贴合 Sera 自身哲学「宿主谱面是视觉权威」）**：
- 只用 Sera 解析自然语言意图 + 出校验报告；
- **导出改为在原谱 MusicXML 上做最小定点修改**（`_apply_minimal`）：保留所有 part /
  backup / chord / direction、未触碰音符 byte 级原样，只改命中小节里匹配音符的
  音高 / 力度 / 演奏记号；
- 加**音符数 + 声部数守恒硬检查**：修订后二者任一变化立即放弃并明确报错，绝不把
  残缺谱交给渲染器；
- **指令点名的小节号现在真正生效**：先 `_normalize_instruction` 把「第二小节」→
  「第2小节」，再 `explicit_instruction_measures` 解析阿拉伯 / 中文 / 范围
  （第 3 到第 5 小节）作为目标作用域；越界小节（如第 999 小节）直接 `out_of_range`
  拒绝，不再静默改错小节。

**验证**：真实 3-part / 5206 音符 OMR 谱，中文「第二小节」/ 阿拉伯 / 范围 / 越界 /
无小节名共 13 项断言全过；`scripts/check-sera-edit.py` 新增自包含 2-part 守恒守卫
（音符 4↔4、part 2↔2、source_preserving 标记、越界拒绝）以及调号/拍号「真改入谱」守卫，
运行 `scripts/check-sera-edit.py` **全部通过**（当前 80 项断言，含 5 项疑问句/否定句 +
4 项多声部守恒 + 8 项调号/拍号真改入谱 + 15 项逐音符力度/断奏真改入谱与「绝不静默 0 改动」
守卫 + 整段力度兜底守卫：把力度改成强 / 力度大一点 / 把第1小节力度改成弱 各 3 项守恒 +
6 项整段力度作用域守卫：3 小节谱上整段写全部小节、指定小节仅改该小节 +
6 项装饰音谱守卫：含 `<grace>` 谱可编辑 / 保留装饰音 / 音符守恒 +
7 项打击乐谱守卫：含 `<unpitched>` 谱可编辑 / 保留 / 音符守恒 + 真畸形音符仍被拒）。

### 调号 / 拍号曾是静默 0 改动（同轮补掉）
`ai_workspace.py` 放行了「调号 / 拍号」意图，但 Sera 把这两者当**全局属性**
（`score["global"]`），`_apply_minimal` 当初只落地了移调/力度/断奏，调号/拍号补丁
**完全没写进原谱**——提案显示「改调号，共 0 处变化」、修订谱里没有 `fifths`/`time`，
用户点应用谱面纹丝不动。修复：在 `_apply_minimal` 里把 Sera 的 key 名（"G major" →
`fifths=1`）和 meter（"3/4" → `beats=3/beat-type=4`）转换成 MusicXML 的 `<key>`/`<time>`，
按每个 part 的首个匹配小节落写（缺失 `<attributes>` 时插入）。同时给 `_propose` 的
Sera-doc diff 循环加了 try/except，避免个别操作（如调号需 whole_score）抛 E05 时
让整条 preview 500。

### 断奏也曾是静默 0 改动（同一类，且被 change_count 假数字掩盖）
`set_articulation` 在 Sera 规则生成器里用的参数键是**复数 `articulations`（列表，如
`['staccato']`）**，而 `_apply_minimal` 当初只读单数的 `value` / `articulation` → 读到空 →
断奏分支整段不执行，`_apply_minimal` 返回 `changed=0`。但响应的 `change_count` 来自 Sera 自己
doc-diff 的报告（Sera 在它那份 doc 上确实加了断奏），于是 UI 显示「N 处变化」、点应用后谱面
**没加任何断奏**——和调号/拍号静默 0 改动一模一样，只是被 `change_count` 的假数字盖住了，
比调号/拍号更难发现。`set_dynamic` 用键 `dynamic`（值 `'ff'`/`'f'`），原本就正确，无需改。
修复：`set_articulation` 分支改读复数 `articulations` 列表（保留单值兼容），并把列表里**每个**
记号都写进 `<articulations>`。回归脚本由此新增「力度 / 断奏真改入谱」+「绝不静默 0 改动」
守卫（共 15 项）；后又新增整段力度兜底守卫，运行 `scripts/check-sera-edit.py` 全部通过。

### 整段力度兜底曾只改第 1 小节（作用域回落，cc=21 假成功）
上一轮新增的整段力度兜底，离线/线上测试看似全绿（每条 `ok=True`、`<dynamics>` 真落盘、
音符守恒），但 `change_count` 恒为 **21** 且所有无小节指令完全一致——这个反常数字暴露了
真 bug：`_resolve_scope` 对「没点名小节的指令」会回落到默认 `{"measures":[1]}`，兜底段直接
复用了这个 `target`，于是「把力度改成强 / 整首力度」**只改了第 1 小节的 21 个音符**，
245 小节 / 5206 音符的谱其余 244 小节纹丝不动。`_apply_minimal` 用的是局部变量 `target`
而非 `patch["target_scope"]`，所以只改 patch 里的 scope 无效，必须改 `target` 本身。
修复：兜底时按 `explicit`（指令点名的小节）分流——**点名了**→ 用 `{"measures":[...]}`；
**没点名**（真正的整段/整首）→ 强制 `target = {"whole_score": True}`。修复后
`change_count` 由 21 变为 **5206**，写到 244 个小节（唯一未覆盖的是全休止小节，符合预期），
指定小节仍只改该小节。
`check-sera-edit.py` 由此新增自包含 **3 小节谱** + 6 项作用域守卫：整段意图断言
「三个小节全部有 `<dynamics>`」、指定小节意图断言「仅目标小节有、其余为 0」——直接卡死
「退回只改第1小节」这类回归。离线（当时 67 项，后续历经装饰音 / 打击乐守卫
增至 80 项）全过，重启 5173 后线上 E2E 亦确认全谱生效。

**顺带根除掩盖机制**：`_propose` 返回的 `change_count` 原本在最小编辑返回 0 时会**回退到 Sera 自身
doc-diff 的计数**——这正是断奏 bug 被假数字掩盖的根因。现已改为**永远以 `_apply_minimal` 真实
改动条目数为准**，未处理类型如实报 0（并触发 HANDLED_KINDS 告警）。从此任何"操作没真落盘"都会
在 `change_count` 与修订谱上同时暴露，不可能再被数字盖住。

## AI 对话行为

`ai_workspace.py` 的 `fast_plan` 在最早位置调用 `sera_edit_plan(text)`：

- **支持的编辑意图** → `edit_score` 动作 → 前端生成**可审查提案**，用户点
  「应用到当前谱面」才生效。支持中文：移调/升降半音/八度、力度、断奏重音、
  调号、拍号、音高、时值。
- **越界意图**（标指法 / 即兴作曲 / 编曲 / 删小节）→ 不生成动作，继续走
  原有的如实拒答，避免乱发动作。
- **疑问句 / 否定句不劫持**：`sera_edit_plan()` 复用了项目现成的
  `QUESTION_ASK_RE` 与 `NEGATION_RE` 提前返回。「第12小节能不能升半音？」
  「移调怎么弄」「不要把第3小节升半音」一律交回模型回答，不抢着改谱。
  这是接入后发现并修掉的真 bug（规则插得太靠前会劫持疑问句），已纳入回归脚本。
- 已实测 **16 项常规意图零回归**（用改动前 `ai_workspace.py` 备份逐条对照）。

### 真 bug：自然语言改谱意图被「做不到」兜底误杀（2026-11-12，真实用户触发）

`check-sera-edit-ai.py` 用**桩响应手动注入 `edit_score` 动作**，只验证了「面板能接住」，
**完全没测 AI 路由**（natural-language → `edit_score` 这一步）。真实用户用自然语言说
「编辑一下第3小节的音符」时，AI 直接回「修改乐谱内容目前做不到」——这句没命中
`SERA_EDITABLE_RE`，`sera_edit_plan()` 返回 `None`，请求漏到 `fast_plan` 里 1413 行的
「做不到」兜底被当成拒答。

根因（两层）：
1. **正则覆盖缺口**：`SERA_EDITABLE_RE` 只列了"移调/升高半音/加断奏"等特定动词，
   没收录用户更顺口的「编辑 / 修改 / 改一下 / 改动」，也没覆盖「对象在前、动词在后」
   的语序（如「把第5小节的音符改成高音do」）。这些说法 `sera_edit_plan` 匹配不上 → 漏到 1413 兜底。
2. **部署陈旧掩盖**：源码看门狗（`server.py` 的 `watch_sources`）按理会 reload `ai_workspace.py`，
   但本次改动后运行中的 5173 进程**没被热更**（疑似 `sources_busy()` 一直为真或 watcher 未触发），
   一度让人以为是纯代码问题——直到直接 `POST /api/workspace-ai` 探活才暴露旧进程仍在拒答。

修复：
- `SERA_EDITABLE_RE` 新增两类自然说法：①「编辑/修改/改一下/改动 + 编辑对象」；
  ②「编辑对象在前、动词在后」语序。
- 给 1413 行「做不到」兜底加 `and not SERA_EDITABLE_RE.search(text) and not QUESTION_ASK_RE.search(text)`
  双闸——从此**任何本可编辑的意图都不可能被它误杀**（疑问句也交回模型，而非拒答）。
- 改完**强制 `restart-server.py` 重启 5173** 让新代码上线，再用真实 `POST /api/workspace-ai`
  探活确认自然语言已返回 `edit_score`。

新增长期回归 `scripts/check-sera-edit-routing.py`（离线调 `fast_plan`，**33/33**），专门守住
"自然语言 → edit_score" 这条之前被桩响应绕过的路由。

### 已知限制（Sera 规则覆盖边界，非 bridge 缺陷）

上面「支持的编辑意图」里列出的 **音高 / 时值** 目前只对**逐音符 + 特定表述**生效，
整体 / 整段表述会被 Sera 规则集判 `unsupported`，bridge 如实降级成「暂不支持」，不会静默乱改。
**唯一的例外是「整段力度」**——Sera 的力度模型是逐音符的（`set_dynamic` 只在选了具体音符时生成补丁），
因此「把力度改成强」「第一小节所有音改成 ff」这类整段表述原本会被判 `unsupported`；
bridge 现已加**整段力度兜底**：识别到「整段/相对力度」意图且 Sera 未产出补丁时，
在目标作用域（整谱或指定小节）的每个音符补写 `<dynamics>`，并同样走音符数 + 声部数守恒硬检查。

| 操作 | 能生成补丁的表述（bridge 可真改谱） | 会 `unsupported` 的表述（暂不支持） |
|---|---|---|
| 力度 | `力度改为ff`、`把最后一个音标为强奏`、`把力度改成强`、`力度大一点`、`把第一小节力度改成弱`（整段，桥接层兜底） | 整段相对力度超出 Sera 无法解析的极端表述 |
| 演奏记号 | `加上断奏` | — |
| 音高 | `把第3个音改成C5` | 整段音高重映射 |
| 时值 | `把第1小节第一个音拉长成八分音符` | `把时值改成八分音符`（整段） |

- 根因：Sera 的时值模型是**逐音符**的（不做"整段统一改时值"），音高同理；
  力度虽也是逐音符，但整段力度已由 bridge 兜底接管（在目标作用域批量补 `<dynamics>`）。
- 判断标准：指令里**点名了具体某个音 / 最后一个音 / 第 N 个音** → 大概率能生成；
  **「把这段/整首的力度改成 X」** → 现在由桥接层兜底成功（已离线 + 线上双验证）；
  **「把这段/整首的时值改成 X」** → 仍返回「暂不支持」（等待 Sera 规则增强）。
- 移调 / 断奏 / 调号 / 拍号 / 整段力度 不受此限，整段 / 全局都能改（已守卫覆盖）。
- 整段力度兜底为**适配层自实现**，不依赖 Sera 规则升级；时值 / 音高的整段化仍待 `sera_vendor/` 增强，
  届时只需升级 vendor，bridge 无需改。

### 实现注意：保护区（protected_scope）目前是潜在缺口

`_apply_minimal` 做最小定点修改时**只读 `target`（目标小节/声部），不读 `protected_scope`**——
尤其 `transpose` 会对目标小节里**每个音符无差别移调**，不会跳过任何"受保护"的音符。

- 现状安全：前端（`dist/*.js`）**从不发送 `protected_scope`**，钢琴编辑面板也没有"保护区" UI，
  所以目前不会出问题。
- 未来风险：一旦有人加「保护某些小节不可编辑」的 UI 并把它传进 `body.protected_scope`，
  本桥的最小编辑路径会**静默无视保护区**（Sera 自带的 `protected_scope_validator` 只作用于
  Sera 的 doc-diff 报告，不影响 `_apply_minimal` 的定点修改）。届时必须在 `_apply_minimal`
  也落实保护区跳过（按 `measures`/`staffs` 排除），否则会重演"AI 改了用户说别动的谱"。
- 验证现状：全项目 grep 确认 `protected_scope` 仅出现在 `sera_bridge.py`（透传 + 回声）与
  `sera_vendor/` 内部，业务前端无调用。

## 验证结果

| 项目 | 结果 |
|---|---|
| JS 语法 `node --check`（4 文件） | 全通过 |
| Python `py_compile`（3 + 43 vendored） | 全通过 |
| `scripts/check-sera-edit.py` | 全部通过（**80 项断言**，含 5 项疑问句/否定句 + 4 项多声部守恒 + 8 项调号/拍号真改入谱 + 15 项逐音符力度/断奏真改入谱与「绝不静默 0 改动」守卫 + 整段力度兜底守卫 + 6 项整段力度作用域守卫 + 6 项装饰音谱守卫 + 7 项打击乐谱守卫 + 越界拒绝） |
| `scripts/check-sera-edit-ai.py` | **8/8 通过**（AI 对话 → 提案面板全链路）。曾用真实「后来（温柔女声版）」谱复现出 1 项失败（`_assert_parseable` 误杀 grace），已于 2026-11-13 修复并复验转绿，详见下方专章 |
| `scripts/check-sera-edit-routing.py` | 33/33 通过（自然语言 → `edit_score` 路由，离线调 `fast_plan`；含 20 正向 + 4 越界 + 9 负向） |
| `scripts/check-validator-parity.py` | **19/19 通过**（浏览器跑真实前端 `parseMusicXML` vs 后端 `_assert_parseable` 的契约，见下方专章） |
| 真实 HTTP E2E（临时端口） | status/preview/apply/undo/错误输入全通过 |
| 浏览器 E2E（5173 真实曲谱） | 加载→提案→应用→撤销全通过，无 Sera 报错 |
| 既有 `check-ai-no-delete.py` | 9/9 通过（删除防护未受影响） |
| 既有 `check-ai-control-actions.cjs` | 通过 |

**已知既有失败（2026-11-13 全部实跑复核，逐条定性；均与本 Sera 接入无关）**：

环境依赖复核：`msedge` 在、代理 `7897` LISTENING、`8765` 上游 LISTENING、
codex 路径 playwright 在——下列失败**不是依赖缺失**。

| 脚本 | 本次实跑 | 定性 |
|---|---|---|
| `check-ai-action-guard.cjs` | **FAIL**（rc=1，30s，桩驱动稳定复现）：「空转动作没有提示」 | **测试脚本整体过时，非产品 bug**——详见下方专章 |
| `check-ai-identity.cjs` | **PASS**（rc=0，真打模型 1m23s）三问都自称 SUPERTANG AI、无被禁自称 | 旧记录「问开发者没自称」是当时的模型回答波动，现已不成立，记录过时 |
| `check-ai-retract.cjs` | **PASS**（rc=0，1m19s） | 旧记录「无输出」为并行压测/重建窗口波动，单跑即过 |
| `check-ai-control-actions.cjs` | **PASS**（rc=0，1m27s） | 旧记录「rc=124 超时」为并行压测波动，单跑即过 |

### `check-ai-action-guard.cjs` FAIL 定性：测试脚本过时，不是产品 bug

它第 1 条用例用「把**已静音**的声部再 mute 一次」当空转反例、期望界面报警
（`assert.equal(r.warned,true)`）。但产品现在把「已在目标状态的幂等控制」定义为**成功**：
`dist/ai-action-state.js` 的 `targetReached` 明确写
`case 'mute': return value!=='all' && state.muted.includes(value)`，并有专门的
`scripts/check-ai-action-state.mjs` **13/13 PASS** 覆盖该语义。事件探针实证：
`mute all` → 回执「已关闭全部 2 个声部」；再 mute 已静音声部 → 静默成功、不报警
（正是幂等语义），所以脚本必然 FAIL。且脚本第 2 条用例又断言「已在目标面板上不误报」，
与第 1 条**自相矛盾**。此外脚本数含「注意：」的消息当报警、并断言
「个子操作执行后界面没有变化」总账文案——这两处文案在当前 `dist/workspace-ai.js`
里已整体废弃（grep 不到），即判据本身失效。

探针同时确认产品的守护精神仍在、只是换了形式：未知动作 `explode` →
「重新核对→暂时不支持这个操作：explode」；空关键词搜索 → 「你想找哪一首？」；
幂等动作 → 明确执行回执。唯一潜在缺口：「只答应不给动作」时只输出「我来处理。」、
无额外提示（脚本第 4 条因第 1 条 FAIL 从未跑到）。

**处置（2026-11-14 已落地）**：唐老师拍板选「连产品缺口一起补」，已实施——
① `scripts/check-ai-action-guard.cjs` 现代化：第 1 条改为验证「幂等静音按成功处理、不误报」、
第 4 条「只答应不给动作」改为验证 repair 被触发（桩回执「重新核对后仍无法确定可执行的操作。」出现即过关）；
移除了已废弃的「注意：」报警器与「个子操作执行后界面没有变化」总账文案判据。
② `dist/workspace-ai.js` 补齐「只答应不给动作」提示：承诺正则动词表补 `处理/安排/搞定/办`
（原只有检索/打开/播放…具体动词，"我来处理。" 这类泛化承诺词之前不触发 repair）。
重跑 `check-ai-action-guard.cjs` → **PASS（rc=0）**。其余 3 项旧记录已按实跑结果更正为 PASS。

### 装饰音谱曾被校验器误杀（2026-11-13 修复，既有 bug）

全量跑 `check-sera-edit-ai.py` 时暴露 1 项 FAIL：「提案失败：修订结果含无效时值，已放弃」。
打开的是 `/api/scores` 第一首 ready 谱「后来（温柔女声版）」（852KB / 2318 音符 /
**22 个 `<grace>` 装饰音**）。MusicXML 规范里 grace note **不写 `<duration>`**（靠 `<type>`），
但 `sera_bridge.py` 的 `_assert_parseable` 要求每个非休止音符 `duration>0`，把合法装饰音
误判为「无效时值」→ **含装饰音的谱任何编辑指令一律 HTTP 400**。而下游 `dist/score.js:23`
的 `parseMusicXML` 明明是 `if(child(item,'grace')){unsupported=true;continue;}` 直接跳过——
后端自称 "Mirror the hard requirements" 却漏了这条跳过，比下游解析器更严。

**定性 = 既有真 bug，与整段力度接入无关**（隔离对照铁证）：绕过 `_propose`（本次所有改动
都在其兜底段）直接 `_apply_minimal` + `_assert_parseable` 跑最小装饰音谱同样抛错；
移调指令根本不进力度兜底；离线 `_propose` 与线上 preview 均复现同一 400。

**修复**：`_assert_parseable` 循环加 `if note.find("grace") is not None: continue`，与前端对齐。
按协作铁律占锁 + `copy2` 备份（`.sites-runtime/sera-rollback/*.gracefix-*.bak`）、
`py_compile` + grep 回读、`check-sera-edit.py` 新增 `GRACE_SCORE` 夹具 + 6 项守卫
（装饰音谱可编辑 / 保留 `<grace>` / 音符守恒，覆盖移调与力度）。

**复验**：主回归 73/73；真实「后来」谱离线 4 类指令（移调/力度/断奏/调号）全 `ok=True`

### 目标调式转调（"移调到 D 调"）— 2026-11-14 新增能力

产品原本只支持**相对**转调（"升高一个半音 / 升一个八度 / 移调 N 个半音"），不认识
"移调到 D 调"这类**目标调式**指令。`sera_vendor/sera_edit/generation/rule_patch_generator.py`
的 `_transpose_delta` 只匹配相对式 → 对"移调到 D调"返回 None → `generate_rule_patch` 落到
`unsupported`，用户看到"做不到"（即唐老师报的"移调到 D调都不行"）。

**修复**：新增目标调式转调解析（按**主音绝对音高类**算音程，不用五度环，
避免跨大小调算错：C 大调→D 小调应 +2 半音，五度环会落到 F）。
- 有调号谱：用 `global.key` 当当前调自动算音程——`sera_bridge._propose` 先确认源 XML 真含
  `<key><fifths>`，因为 `normalize_score_document` 会把缺调号谱默认成 C major，不可盲信；
- 无调号谱：**必须**用户显式给源调（"把这首从 C 调移调到 D 调"），否则给清晰提示，绝不拿默认 C major 瞎猜；
- 整曲操作：移调 + 改调号同时作用于整份谱（强制 whole_score），避免"只移第 1 小节、调号却变 D"的破谱；
- 支持句式："移调到 D调 / 转调到降B调 / 移调到 D大调 / transpose to D major / 把这首从 C 调移调到 D 调"
  **以及自然语言「更改/改成/改到/调成/换成/改为/变更 +（可夹宾语如『简谱』）+ 到/成 + 调名」**：
  "更改简谱到 D调琵琶谱 / 改成D调 / 改到D调 / 调成D调 / 换成D调琵琶谱 / 改为D调 / 变更到D调 / 把这首改成D调"。

**2026-11-14 二次复核——「更改/改成 X调」两层缺口（唐老师报"更改简谱到 D调琵琶谱都不行"）**：
首轮只补了"移调/转调"的目标调式解析，但用户实际用"更改/改成"等词时仍 `unsupported`。根因是**两层都只认"移调/转调"**：
- AI 层 `ai_workspace.py` 的 `SERA_EDITABLE_RE` 没把"更改/改成 + 调名"识别成可编辑意图 → `sera_edit_plan()` 直接返回 None，连 `edit_score` 动作都不生成；
- 规则层 `_parse_transpose_target_key` 触发词也只有"移调/转调/移到/转到/transpose/to"，且动词与调名之间不允许夹宾语（如"简谱"），"更改简谱到 D调琵琶谱"匹配不上。
两处已补齐：AI 层 `SERA_EDITABLE_RE` 增加"更改|改成|改到|调成|换成|改为|变更|调到|转成|变调"且允许夹 ≤12 字宾语（须后接「到/成」+ A–G 调名，避免误吞"改力度/改速度"）；
规则层触发词同步扩展并允许夹宾语。
**验证**：活端点（pid 46176）对 12 种说法（含用户原话"更改简谱到 D调琵琶谱"及全部"改成/改到/调成/换成/改为/变更/把这首改成"变体）
全部返回"改调号、移调 +2 半音"提案（12/12）；主回归 `check-sera-edit.py` 全绿、转调端到端全 PASS；
简谱识别链路 `jianpu.recognize` 入口与 `server.py` 路由未动、确认完好（唐老师说的"简谱"只是源素材描述，失败点在"改成D调"措辞，非 OCR）。

**验证**：`rule_patch_generator` 单元测试（解析/音程/跨大小调）+ `sera_bridge._propose` 端到端
（有调号谱生成 +2 半音+改调号 D major、无调号谱+显式源调同样通过、无调号谱无源调给清晰提示）
全部 PASS；临时回归脚本见 `.sites-runtime/test-transpose-key.py` 与 `test-transpose-e2e.py`。
且守恒；重启 5173 后线上 preview（移调 cc=17、力度 cc=2318）`LIVE GRACE-FIX OK`；
浏览器 E2E 从 7/8 **恢复 8/8**（提案面板「第 1 小节：移调 +1 半音，共 17 处变化」）。

> **部署须知（2026-11-14 复核 + 二次复核修正）**：`server.py` 的源码 watcher 监视顶层 `*.py` + `scripts/*.py`，
> 触发后是**整个进程重启、从磁盘重读全部模块**（含嵌套的 `rule_patch_generator.py`），所以改动最终会生效；
> 但 `sources_busy()` 在有后台任务（OMR/转写/编排等）时会**推迟重载**、且无法确认"到底生效没生效"。
> 本轮先手动 `restart-server.py`（pid 55108），观测到 watcher 随后又把进程重载成 46176，活端点实测两版都 12/12 通过，
> 证明修复已落地。经验法则：**改完 `sera_vendor/**` 或 `ai_workspace.py` 后，手动跑一次 `restart-server.py` 最稳**，
> 然后用 `POST /api/sera-edit/preview` 直连实测确认（见上"12/12 全 PASS"），不要只凭"文件改了"就假定上线。

### 2026-11-15 回归修复：目标调正则把力度/音名误判成调名

**发现途径**：唐老师要求"扮演音乐家想 100 个问题、用真实浏览器测多轮改谱闭环"。
隔离版实跑（每条独立 browser context）暴露 `B01 / F01 / K07` 的
「力度改成 ff」「把第 3 小节的 C 改成 D」却生成「改调号、移调 +5 半音」提案。

**根因**：上节（2026-11-14 二次复核）为支持「更改/改成 X调」扩展触发词时，
`rule_patch_generator.py` 的目标调正则把调名后缀 `(大调|小调|调|major|minor)?` 留成了**可选**，
且允许动词与调名间夹 ≤12 字宾语。于是力度记号 `ff` / `mf` 里的字母 `f`、音名 `D`
都被当成目标调 → 力度/音高请求被错误转成移调提案。**这是 11-14 那次修复引入的回归。**

**修复**（`rule_patch_generator.py:189`）：调名后缀改为**必须存在**。
不要用「字母前后非字母即可」的替代方案——实测那会重新误命中「把第 3 小节的 C 改成 D」。

**验证**（全套已跑）：
- `py_compile` 通过、改动回读确认；
- 旧 `test-transpose-e2e.py` 3/3 PASS；
- 离线：已支持的 **15/15** 种说法全部保住（含 `transpose to D major`、`降B调` → Bb major/10），
  **8/8** 种力度/音高/渐强/6-8 拍/连奏说法全部挡住，0 误伤；
- `sera_bridge._propose` 真实链路：「把力度改成 ff」→ `proposed`「改力度」、
  「把第 1 小节力度改成 ff」→ `proposed`「第 1 小节：改力度」（修复前错成移调）；
- 手动 `restart-server.py` 重启 5173 后，**活端点** `/api/sera-edit/preview` 复测同样结果，
  「移调到 D调」仍 +2 半音 —— 确认服务端已加载新代码。
- 备份：`.sites-runtime/rule_patch_generator.py.bak-20261115-025839`。

**遗留能力缺口（非本次回归，未改）**：
- 「太强了，改成 mf」仍 `unsupported`（规则层缺 `mf` 力度词解析）；
- 「换成 6/8 拍」「第 2 行标连奏」`unsupported`（规则层有 `change_time_signature` / `set_slur`
  能力，但触发词只认「拍号」「添加连音线」）；
- 「整首加上渐强」`unsupported`（规则层根本没有 crescendo 能力，模型却把它映射成
  `tempo_curve` 速度渐变，属语义误解）；
- `ai_workspace.py:1914` 的 system prompt action 清单**不含 `edit_score`**，导致上述说法
  落到模型时按旧认知答「系统不支持改谱」；`:1421-1426` 还有「修改乐谱内容目前做不到」过时拒答文案。
详见 `.sites-runtime/MUSICIAN-LOOP-FINAL-REPORT.md`。

### 打击乐（unpitched）谱也曾被同一个校验器误杀（2026-11-13 修复，同类第二个）

修完 grace 后按「后端校验器必须与下游**完全一致**」的纪律做系统性对照，发现
`dist/score.js:23` 的容错清单里还有一条没对齐：`const pitch=child(item,'pitch'),
unpitched=child(item,'unpitched'); if(!pitch&&!unpitched){unsupported=true;continue;}`——
**有 `<unpitched>` 的打击乐 / 无音高音符是前端明确允许的**（用 `midi-unpitched` 定音高，
step/octave 取默认值）。但 `_assert_parseable` 仍写成 `if pitch is None ... raise
（无音高音符）`，于是**含打击乐音符的谱任何编辑指令一律 HTTP 400**。

**影响面比装饰音大近 20 倍**：全量扫 4571 份缓存谱，含 `<unpitched>` 的 **264 份（5.8%）**，
其中 **263 份 id 命中线上 ready 曲谱**（前端本就能正常渲染）；而 `<grace>` 仅 14 份（0.3%）。
真实谱复现：`_propose` 移调直接抛「修订结果含无音高音符，已放弃」。

**定性 = 同一函数、同一根因的既有第二个漏网**（隔离对照）：绕过 `_propose` 直接
`_apply_minimal` + `_assert_parseable` 跑最小 unpitched 谱同样抛错，与本轮改动无关。

**修复**：`_assert_parseable` 里把 `pitch is None` 分支细分为——有 `<unpitched>` 则放行
（仍保留 `duration>0` 校验，与下游一致），既无 `pitch` 又无 `unpitched` 的**真畸形音符
仍拒绝**（安全底线不放宽）；同时把函数 docstring 补成前端完整跳过清单，杜绝第三次漏网。
`check-sera-edit.py` 新增 `UNPITCHED_SCORE` 夹具 + 7 项守卫（可编辑 / 保留 `<unpitched>` /
音符守恒，覆盖移调与力度；外加「真畸形音符仍被拒」）。

**复验**：主回归 **80/80** + 路由 33/33 + 浏览器 E2E 8/8 全绿；真实含 unpitched 谱
（836KB）线上 preview `LIVE UNPITCHED-FIX OK`（力度 cc=2946、移调 HTTP 200、
时值仍 unsupported）；线上 status HTTP 200 健康。

> 备注：探活时有 2 首含 unpitched 谱对「把第1小节升高一个半音」返回 `unsupported`，
> 这是 Sera 规则层对个别谱的覆盖边界（同批 unpitched 谱另有移调 `ok=True` 的），
> 与 unpitched 修复无关；诊断脚本曾因对空 `revised_xml` 调 `_note_total` 抛
> `ParseError`，属脚本误报，已定性，非产品 bug。

### 前后端校验器契约测试（2026-11-13，机制化防第三次漏网）

连修 grace / unpitched 两次「后端校验器比下游解析器更严、误杀合法谱」后，
光靠「人肉抄下游跳过清单」已证明会漏。加了 `scripts/check-validator-parity.py`：
用 playwright 在浏览器里 **`import('/score.js')` 调用真实前端 `parseMusicXML`**
（5173 把 `dist/` 作为静态根，故路径是 `/score.js` 而非 `/dist/score.js`），
与后端 `sera_bridge.py::_assert_parseable` 对同一批谱做接受/拒绝比对。

- **核心契约（单向蕴含）**：凡前端能正常渲染的谱 ⇒ 后端编辑校验必须放行。
  覆盖 6 类自包含边界夹具（normal / grace / unpitched / rest / chord / grace+unpitched）
  + 9 首真实缓存谱抽样（含 grace / 含 unpitched / 普通各 3 首）；另断言
  `duration<=0` 的无效数据两边都拒。**这正是两次历史 bug 的方向**。
- **两处刻意策略差异显式白名单**（不是 bug，防止被顺手「修好」破坏安全底线）：
  ① `malformed`（既无 pitch 又无 unpitched 的畸形音符）前端 accept+`unsupported=true`、
  后端 reject —— 「绝不放行残缺谱」的安全底线，后端故意更严；
  ② `grace_only`（整谱只有装饰音、无可演奏音符）前端 reject、后端 accept ——
  这类谱用户根本打不开、实际不可达，且方向与两次 bug 相反，故意保留。
- **有效性反证**（校验工具本身也要先被校验）：用 `importlib` 的 `SourceFileLoader`
  加载修复前的两个 `.bak` 备份模块跑同一批夹具——`gracefix` 版对 grace/unpitched
  都 REJECT、`unpitchedfix` 版对 unpitched REJECT，即**任接一个历史版本契约都会红**；
  当前修复版两者都 accept、契约 19/19 通过。证明测试不是空转。
- 用法见下；前提：5173 在跑（要 serve `/score.js`）、有 playwright + 本机 Chromium。
  无缓存谱时只跑边界夹具，仍能有效。

## 2026-11-15：100 问真实浏览器测试后的剩余能力缺口补齐

来源：`.sites-runtime/MUSICIAN-LOOP-FINAL-REPORT.md` 第五节列出的 7 项缺口。
本轮按「**只补规则层真能做、且能真落写的能力**」原则处理，其余一律改成诚实说明，
不为了「看起来支持」而制造假闭环。

### 决策：刻意不对模型开放 `edit_score`

报告里曾把「system prompt 的 30 个 action 不含 `edit_score`」列为错误拒答的**总根因**，
建议补进 prompt。本轮复核后**反而不补**，理由：

- 改谱动作由 `fast_plan → sera_edit_plan → SERA_EDITABLE_RE` 规则层强制转提案，
  模型从不参与「这句话要不要改谱」的判断；
- 一旦告诉模型可以发 `edit_score`，它会把规则层**并不支持**的说法（渐强、连奏线、
  标指法…）也转成提案，结果是一堆 `unsupported` 或 `change_count=0` 的假提案；
  用户点「应用」看到「已应用修订」却什么都没变，比「系统暂不支持」更糟；
- 错误拒答的正确修法是**让这些说法不落到模型**：补规则层触发词 + 在 `fast_plan`
  里加确定性回执，而不是扩大模型的自由裁量权。

所以 `plan_data` 的 `allowed` 里虽仍保留 `edit_score`（历史兼容），
system prompt 的 action 枚举**不加**它。

### AI 层改动（`ai_workspace.py`）

| 改动 | 说明 |
|---|---|
| `SERA_EDITABLE_RE` 补分数拍号 | `(?:改\|换\|调\|设\|变\|换成\|调成)[^，。；、！？\n]{0,6}?\d+\s*/\s*\d+`，覆盖「换成 6/8 拍」「第二页也改成 3/4」「调成 2/4 拍」；离线 12 条验证不误伤「第 5 到第 8 小节」「速度设为 120 BPM」「把力度改成 ff」 |
| 目标调分支后缀改**必须存在** | 与 `rule_patch_generator.py:189` 同步。这是 11-14 回归在 **AI 层的残留**：规则层 03:05 已修、AI 层没修，离线实测「把第 3 小节的 C 改成 D」仍被误判成改调号意图 |
| 改写 `:1421` 过时拒答 | 原「修改乐谱内容目前做不到 —— …不能改动音符、时值或拍号本身」在接入 Sera 后已不成立；改为如实说明「这条说法暂无对应规则」+ 列出真正可用的说法，`actions` 仍为空防止「删小节」被劫持 |
| 新增 `SERA_CAPABILITY_ASK_RE` | 「这个谱能移调吗」「能不能改拍号」给确定性肯定答复 + 能力清单；排除带具体小节的委婉编辑请求（「能把第5小节升半音吗？」仍按既有铁律交模型） |
| 新增 `CRESCENDO_RE` | 「渐强 / 渐弱」明确说明规则层没有 crescendo 能力，**不会**被当成 `tempo_curve` 速度渐变；排除「渐快 / 渐慢 / accelerando」等合法速度词 |
| 新增 `SLUR_UNSUPPORTED_RE` + `SERA_OUT_OF_SCOPE_RE` 加连奏 | 连奏线是假闭环，明确越界，交给诚实回执，不再生成 `change_count=0` 的提案 |

### 规则层改动（`rule_patch_generator.py`）

- `_time_signature_value()`：guard 允许分数拍号直接出现（`\d+\s*/\s*\d+\s*拍?`），
  `findall` 补「换成 / 调成 / 设为 / 设成 / 变成 / 变为 / 改到 / 调到」等动词。
  只在 `edit_score` 通道内调用，不会误伤播放 / 音量指令。
- `_is_slur()` **刻意不扩展**：见下方「不制造假闭环」。

### 不制造假闭环：`set_slur` 仍不接入

100 问里「第 2 行标连奏」曾落到 unsupported，本想补触发词，核查后发现：

1. `sera_bridge.HANDLED_KINDS` 不含 `set_slur`，`_apply_minimal` 不落写 `<slur>` → `change_count=0`；
2. `dist/app.js` 用 `parseMusicXML(xml)` 解析修订 XML，而 `dist/score.js` 只认
   tie / dynamics / fingering，**不解析 `<slur>`**；
3. `_propose("添加连音线")` 实测返回 `status=proposed` 但 `change_count=0`。

也就是说即使出提案、点「应用」、面板显示「已应用修订」，谱面也不会有任何连线。
接入 AI 路由只会把「诚实拒答」变成「假装成功」。要真闭环需后端落写 +
前端解析与渲染层一起改，属独立功能开发。

### 验证矩阵（重启后，pid 66236）

| 项目 | 结果 |
|---|---|
| `py_compile` 两个 .py | PASS |
| `check-sera-edit.py`（自包含全量） | 全部通过 |
| `check-sera-edit-routing.py` | 33/33 |
| `verify-ai-layer-20261115.py`（离线路由 + 误伤防护） | 失败 0 项 |
| `verify-live-20261115.py`（活端点 `/api/sera-edit/preview`） | 8/8 |
| `check-sera-edit-ai.py`（AI 对话 → 提案面板 E2E） | 全部通过 |
| `check-ai-action-guard.cjs` | PASS |
| `check-frontend-syntax.cjs` | 189 文件 PASS |
| 真实浏览器 4 条 | 「换成 6/8 拍」「把力度改成 ff」「移调到 D调」闭环 PASS；「这个谱能移调吗」回执正确 |

> 注：`musician-loop-smoke.cjs` 对「这个谱能移调吗」打印 `FAIL(无提案面板)`，
> 是冒烟脚本只认「有提案」的判据不适用，这条本就不该出提案，**不是产品失败**。
> 另 `check-ai-identity.cjs` 等 live-model 脚本本轮在等待上游时被终止，属环境波动，
> 历史单跑为 PASS（见「`check-ai-action-guard.cjs` FAIL 定性」章节）。

### 仍未闭环的能力（如实保留）

- 连奏线 / legato：需后端 `_apply_minimal` 写 `<notations><slur>` + 前端 `score.js` 解析渲染。
- 渐强 / 渐弱 crescendo：规则层无能力，目前只做诚实说明。
- 多轮连续编辑后的相对移调、撤销（`#sera-undo` 面板按钮与 AI 话术未对齐）。
- `workspace-ai.js:466-468` 对 `setLoop()` 返回 `{cleared:true,had}` 的分支仍会拼出 `undefined`
  （隔离版重跑不复现，属旧共享上下文污染产物，但代码隐患还在）。
- 「把断奏改成连奏」规则层早先会生成 `staccato` 的语义偏差，现已由诚实回执接管，
  但真正的「把 A 记号替换成 B 记号」能力尚未实现。

## 日常使用

页面「乐谱精准编辑」面板：输入中文指令 → 生成提案 → 核对变化数与校验提示 →
应用 / 放弃；「撤销上次编辑」逐层回退。也可以直接在 AI 对话里说
「把第 3 小节升高一个半音」，AI 会生成提案并提示到面板确认。

改完记得跑回归脚本：
```
python scripts/check-sera-edit.py            # 适配层 + 护栏（临时端口，秒级）
python scripts/check-sera-edit-routing.py    # 自然语言 → edit_score 路由（离线）
python scripts/check-sera-edit-ai.py         # AI 对话 → 提案面板（浏览器，需 5173 在跑）
python scripts/check-validator-parity.py     # 前后端校验器契约（浏览器跑真实 parseMusicXML）
```
