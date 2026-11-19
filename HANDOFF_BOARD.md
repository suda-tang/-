# 实时交接看板（多会话并发协作必读）

本文件是**活**的。并存的多个 WorkBuddy 会话共享同一份项目目录，但彼此看不到对方的对话——
**这是它们之间唯一的协调通道**。任何会话开工前先读它，动文件前先在这里占锁，干完立刻释放。

> 完整历史流水账在 `WORKBUDDY_HANDOFF.md`，本看板只放"当下状态 + 实时锁"。改大逻辑前先翻对应轮次。
> 本文件是协调基础设施，**不要把它当项目源码提交**；它出现在 `git status` 里属正常。

---

## 铁律（3 条）

1. **动文件前先占锁。** 改任何 `dist/*.js` / `*.py` / `*.css` 前，先在下方 `## 文件锁` 表占一行；干完立刻删掉那行。
   占锁格式（一行）：`LOCK | <相对路径> | <任务简述> | <占锁 HH:MM> | <预计释放 HH:MM 或 ETA>`
   查锁：`grep -n "LOCK | <路径>" HANDOFF_BOARD.md`。
   - 锁 < 30 分钟且未释放 = 别人正在动，**绕开该文件或等它变 stale**，不要硬改。
   - 锁 > 30 分钟没心跳 = 那个会话多半已结束，可直接接管（接管前先 `git diff <文件>` 看它留了什么）。
2. **改完必须校验 + 回读。** 并行 Edit 会互相覆盖——改完立刻 `node --check <文件>`（JS）/ `python -m py_compile <文件>`（py），再 `grep` 回读关键改动。不回读等于没改。
3. **不替别人提交、不整体 reset。** 不要 `git reset --hard`、不要批量覆盖 `dist/`、不要把混着多会话半成品的工作树整体 `git commit`/`git push`（见下方"在途工作"）。

---

## 活动任务（谁在干什么）

| 任务 | 状态 | 占用人 / 会话 | 最近更新 |
|---|---|---|---|
| 刷新云曲库按钮失灵（Bug1） | ✅ 已修复并实测通过 | 本会话（2026-10-10） | 2026-10-10 |
| Daw→五线谱卡"正在准备后续谱面"（Bug2） | ✅ 已修复并实测通过 | 本会话（2026-10-10） | 2026-10-10 |
| 琴谱库显示"暂不可用，点击刷新重试"（Bug3） | ✅ 已修复并实测通过 | 本会话（2026-10-10） | 2026-10-10 |
| 云曲库首屏流式渲染（Bug4） | ✅ 已修复并实测通过 | 本会话（2026-10-10） | 2026-10-10 |
| 云曲库缓存优先首屏（Bug5） | ✅ 已修复并实测通过 | 本会话（2026-10-10） | 2026-10-10 |
| AI 连续对话卡死（Bug6） | ✅ 全修：前端 3 处 + 服务端根因（/api/scores 列表级缓存 + 轮询退避）+ 重启验证 | 本会话（2026-10-11） | 2026-10-11 |
| **AI 动作从不执行 / busy 永久卡死（Bug7）** | ✅ 已修复并实测：requestAI 收 result 即收工；音乐家 9 轮 0 失败 | 本会话（2026-10-11） | 2026-10-11 |
| Bug7 后续：补「只答应不给动作」警告 + 修测试误报 + 补 4 个测试脚本代理绕过 | ✅ 完成；真实模型审计 5/5 轮状态全对 | 本会话（2026-10-11） | 2026-10-11 |
| **曲谱课堂浏览器测试（score-classroom）** | ✅ 修 1 个真 Bug（流式提问尾部追加 signal timed out）；顺带全项目扫出并修掉同款 SSE 卡死 3 处 | 本会话（2026-10-11 夜） | 2026-10-11 |
| Bug8（查不到位置就吞掉同句其它动作）/ Bug9（换曲冲掉声部） | ✅ 均已修；longflow #48 由历史 16 次全 FAIL 转 PASS | 本会话（2026-10-11） | 2026-10-11 |
| GitHub 推送（远程落后本地大量提交） | 阻塞：138MB 经代理推不上去 | **待解决（需用户拍板）** | 2026-10-10 |
| 建立本交接看板（多会话防互踩） | 进行中（本会话） | 2026-10-10 本会话 | 2026-10-10 |

---

## 文件锁

占锁 / 释放都改这一节。当前为空 = 暂无人在占锁。

> 2026-11-18 15:20–15:3x 给全库乐理索引加「过期提醒」，防旧索引骗人（本会话）；**锁已全部释放**。
> 根因：11-18 15:00 我曾拿 2026-10-09 的过期索引（covered=1873）断言「曲库没有人声谱」，
>   实际重建后有人声谱 4 首 —— 索引说「没有」≠现实没有。为防复发，给检索结果附时效提醒。
> 改动：① `music_index.py` 新增 `INDEX_STALE_DAYS=7.0` + 纯函数 `index_staleness(index,library_count)`，
>   检测 builtAt≥7 天 / covered 落后≥20 首 / building 三种信号，返回中文括注或 ''。
>   覆盖差阈值从「有任何差」放宽到 ≥20（新鲜索引 1892 vs 曲库 1898 差 6 属正常波动，不报）。
>   ② `ai_workspace.py` 两处调用点接入：`run_library_query`（模型结构化查询路径，1151-1157
>   用变量名 stale，4 个返回分支全拼）、`plan_theory_search`（主路径，1299-1305 用变量名 note，
>   top_chord/sort/无命中/翻页 4 个分支全拼）。清掉「库里没有人声谱是事实」错误注释。
> 验证：`py_compile` PASS；`.sites-runtime/check-index-staleness.py` 8/8（含真实重建索引无误报）；
>   `.sites-runtime/check-instrument-find-routing.py` 10/10（找谱路由未被破坏）；
>   进程内注入过期索引 → 两个调用点回复都带「索引建于…10 天前」字样（闭环验证，非只测函数）；
>   重启 5173（pid 75316→72504，restart.log 15:23:59）；真实浏览器
>   `.sites-runtime/check-index-staleness-live.cjs` 4/4（新鲜索引 0 天不误报、人声检索返回
>   亲爱的/北京欢迎你/同道/后来 4 首真实曲目、无转谱链接、无 pageerror）。
> 备份 `.sites-runtime/music_index.py.bak-20261118-152000` 与 `ai_workspace.py.bak-20261118-152000`。

> 2026-11-18 14:50–15:00 修「按乐器/声部找谱」被误判成联网找转谱链接（本会话）；**锁已全部释放**。
> 用户实测「请找一下有人声轨道的谱子」→ AI 甩一堆转谱链接。根因在两条 web_search 通道：
>   ① `_external_find_intent` 的「找+谱子」把按乐器筛选也判成外部找谱；
>   ② `plan_theory_search` 0 结果时 `_find_pieces_intent` 又转联网。
> 关键事实：`music_index.INSTRUMENT_RULES` 与 `parse_theory_spec` **本来就支持人声**
>   （能解析成 instrument=人声）。~~真实曲库没有人声谱~~ ← **这是当时的错误结论**：
>   当时依据的是 2026-10-09 的**过期索引**（covered=1873），实际曲库有人声谱
>   （《同道》a6ab96d… 的 `<part-name>` 就是「人声、钢琴」）。索引已于 11-18 增量重建，见下条。
> 改动（`ai_workspace.py`）：两处 web_search 前排除「能解析出 instrument 槽的筛选请求」，
>   让它们走 `plan_theory_search` 用真实索引回答（库里没有就如实说没有，不甩链接）。
>   显式外部源（网上/全网/联网）在 1195 行已优先判定，不受影响；带书名号的具体作品仍联网找。
> 验证：py_compile + 路由回归 10/10（新增 `.sites-runtime/check-instrument-find-routing.py`）；
>   check-ai-web-search.py PASS；check-musician-questions.py PASS；重启 5173 后真实浏览器实测：
>   「有人声轨道」→「全库 1898 首里没有含人声声部的作品」（如实回答，无链接）、
>   「找有钢琴的谱子」→ 真实 806 首列表、「找网上有人声的谱子」→ 仍联网找转谱（未误伤）。
> 备份 `.sites-runtime/ai_workspace.py.bak-20261118-145000`（music_query 备份了但**未改**该文件）。
> 注：check-theory-search.cjs 本轮耗时约 10 分钟但**最终 RC=0**（含钢琴+大三/大七和弦检索 636 首等
>   真实结果），全库索引检索未受影响。
>
> **15:13 追加——真正的根因是索引过期，已重建**：15:00 时我说「库里没有人声谱」是**错误结论**，
>   依据是 2026-10-09 的过期 theory-index（covered=1873）。实查缓存 XML：《同道》a6ab96d…
>   的 `<part-name>` 就是 `['人声','钢琴']`。跑 `scripts/build-theory-index.py` 增量重建（5.8 分钟，
>   covered 1873→1892、乐器标签 27→28），索引里人声谱 **4 首**（亲爱的/北京欢迎你/同道/后来）。
>   重建后真实浏览器复测「请找一下有人声轨道的谱子」→「含人声声部的作品共 4 首：亲爱的、北京欢迎你、
>   同道、后来」，闭环正确。**教训：拿索引/缓存当事实前先查 builtAt，工具说没有≠现实没有。**

> 2026-11-17 17:15–19:05 修 set_loop/set_range 回执 undefined（本会话）；**锁已全部释放**。
> 根因：`ai-advanced-actions.js:setLoop()` 在「取消循环 / 空值 / 退化区间」返回 `{cleared:true,had}`，
>   没有 from/to，而 `workspace-ai.js` 三处 handler 无条件拼 `r.from/r.to` → 「第 undefined 小节」。
> 改动：`workspace-ai.js:466-470` 三处 handler 先认 `cleared` 分支给明确回执
>   （「已取消循环，恢复完整播放」/「当前没有设置循环」），正常分支与 tempo_curve 用
>   `Number.isFinite` 兜底，失效时抛清晰错误，杜绝裸拼 undefined。
> 验证：node --check + 前端语法 189 文件 PASS + action-guard PASS + control-actions PASS；
>   专用浏览器探针 `.sites-runtime/check-loop-undefined.cjs` 4/4（正常循环 / 取消循环 /
>   取消区间 / 正常区间播放均无 undefined，pageerror 无）。仅改前端静态文件、server 实时 serve，无需重启。
> 备份 `.sites-runtime/workspace-ai.js.bak-20261117-171500`。

> 2026-11-17 16:53–16:58 修「低八度都不行」+ 去掉 SeraEdit v1.0.0 展示标识（本会话）；**锁已全部释放**。
> 根因两层：① AI 层 `SERA_EDITABLE_RE` 不认「移低/低八度」→ 落模型拒答；
>   ② 规则层 `_transpose_delta` 只认「升高/降低/上移/下移 X八度」，漏「降一个八度/移低八度/低八度」。
> 改动：`ai_workspace.py` 补八度口语正则；`rule_patch_generator.py:_transpose_delta` 补 ±12 说法
>   并加「音量/响度/声音 + 八度」守卫（防口语误用被当移调）；`dist/sera-edit.js` 面板标题去掉
>   `SeraEdit v1.0.0` span；`sera_bridge.py` engine 字段与 docstring 中性化；`SERA-INTEGRATION.md` 标题中性化。
>   MIT 出处（GitHub 链接 / LICENSE / 历史流水账）按要求保留。
> 验证：py_compile + 八度诊断 20/20（±12 全对、音量误用被挡）+ Sera 全量 PASS + 路由 33/33 +
>   离线 0 失败 + 前端语法 189 文件 PASS；重启 5173 后活端点实测「低八度/移低八度/降一个八度」
>   → -12 半音、「高八度」→ +12、「音量调低八度」→ unsupported；真实浏览器「低八度」「移低八度」
>   均闭环 PASS（提案 → 应用 → 已应用修订）。status 的 engine 已显示中性化文案。
> 备份 `.sites-runtime/*.bak-20261117-165300`。新增诊断脚本 `.sites-runtime/diag-low-octave.py`。
> 注：status 里的纯数字 `version: 1.0.0` 保留（非品牌标识、可能被前端契约依赖，未擅删）。

> 2026-11-15 02:58–03:05 修目标调正则回归（力度 ff/mf、音名 D 被当成调名 → 错误移调提案）。
> `rule_patch_generator.py:189` 把调名后缀由「可选」改为「必须存在」。py_compile 通过、
> 旧 E2E 3/3 PASS、离线 15/15 保住 + 8/8 挡住、重启 5173 后活端点实测：
> 「把力度改成 ff」→ proposed「改力度」（原错成「改调号、移调 +5」）、「移调到 D调」仍 +2 半音。
> 备份 `.sites-runtime/rule_patch_generator.py.bak-20261115-025839`。锁已释放。

> 2026-11-15 03:05–03:37 补齐 100 问真实浏览器测试列出的剩余能力缺口（本会话）；**锁已全部释放**。
> ① `ai_workspace.py`：`SERA_EDITABLE_RE` 补分数拍号自然说法（「换成 6/8 拍」「第二页也改成 3/4」）；
>   同时把目标调分支的调名后缀由「可选」改为**必须存在** —— 这是 11-14 引入的回归在 **AI 层的残留**
>   （规则层 03:05 已修、AI 层没修，离线实测「把第 3 小节的 C 改成 D」仍被误判成改调号意图）。
> ② 改写 `:1421` 过时拒答文案「修改乐谱内容目前做不到」；新增「诚实能力边界」三件套：
>   疑问式能力询问给肯定答复、渐强不误映射成 `tempo_curve`、连奏线不假装成功；
>   **刻意不对模型开放 `edit_score`**（模型自由发改谱会把不支持的说法变成一堆 unsupported 提案）。
> ③ `rule_patch_generator.py`：`_time_signature_value()` 补分数拍号动词；`_is_slur()` 刻意不扩展
>   （`set_slur` 后端不落写 `<slur>`、前端 `score.js` 不解析，是假闭环）。
> 验证：`py_compile` + Sera 全量 PASS + 路由 33/33 + 离线 0 失败 + 活端点 8/8 +
>   真实浏览器 4 条（换成 6/8 拍 / 把力度改成 ff / 移调到 D调 均闭环 PASS，能力询问回执正确）+
>   `check-sera-edit-ai.py` 全过 + 前端语法 189 文件 PASS + `check-ai-action-guard.cjs` PASS。
> 重启 5173：旧 pid 63184 → 新 pid 66236。备份 `.sites-runtime/*.bak-20261115-030507`。
> 新增工件 `.sites-runtime/verify-ai-layer-20261115.py`、`verify-live-20261115.py`。
> 详见 `SERA-INTEGRATION.md` 与 `.sites-runtime/MUSICIAN-LOOP-FINAL-REPORT.md`。

> 2026-11-12 18:20–18:40 本会话接入 SeraEdit v1.0.0（已完成并释放全部锁）。
> 详见新文档 `SERA-INTEGRATION.md` 与回归脚本 `scripts/check-sera-edit.py`。

> 2026-11-13 22:33–22:40 修 `_assert_parseable` 误杀 `<grace>` 装饰音（1 行 + 6 项守卫），
> 全套回归 73/73 + 浏览器 E2E 8/8 复验通过，锁已全部释放。详见 `SERA-INTEGRATION.md`。

> 2026-11-13 22:53–23:00 修 `_assert_parseable` 误杀 `<unpitched>` 打击乐音符，
> 加 7 项守卫（含「真畸形音符仍被拒」安全底线）；全套 80/80 + 33/33 + E2E 8/8、
> 线上 `LIVE UNPITCHED-FIX OK`，锁已全部释放。详见 `SERA-INTEGRATION.md`。

> 2026-11-13 23:08–23:12 新增 `scripts/check-validator-parity.py` 前后端校验器契约测试
> （浏览器 import 真实 `/score.js` 的 parseMusicXML 比对后端 _assert_parseable），
> 19/19 通过；用修复前备份反证「契约测试确能抓到 grace/unpitched 两次历史 bug」。
> 详见 `SERA-INTEGRATION.md`。锁已释放。

> 2026-11-14 重做：action-guard 现代化（dist/workspace-ai.js 补「只答应不给动作」提示、scripts/check-ai-action-guard.cjs 改判据）+ 目标调式转调能力（rule_patch_generator.py / sera_bridge.py）。
> 关键发现：server.py 的源码 watcher 只监视顶层 *.py + scripts/*.py，且 `sources_busy()` 在有后台任务时永久推迟重载，故嵌套的 rule_patch_generator.py 改动**不会被自动重载**；
> 实测旧进程（pid 12560）从 11-13 起从未重载。已用项目自带 `scripts/restart-server.py` 干净重启 5173（新 pid 55108），并 POST 活端点 `/api/sera-edit/preview` 实测：
> 「G大调谱+移调到 D调」→ proposed（调号 1→2 升号、移调 -5 半音）；「无调号谱+移调到 D调」→ unsupported+友好提示；「无调号谱+从 C 调移调到 D 调」→ proposed（+2 半音）。锁已释放。



> （注：下方「本会话正在建看板…」为历史残留注释，看板早已建完并释放，此处仅作锁区。）



---

## 在途工作 / 已知状态（接手前必读）

- **工作树现状（车祸现场）**：`git status` 显示 35 个文件 `modified` + 117 个 `untracked`，
  混了多个会话的半成品（DAW 视图、mentor 系列、upload_auth、gzip 压缩、AI 系列
  `dist/ai-*.js` / `ai_workspace.py` 等）。**不要整体提交**，否则把别人的半成品裹进同一 commit。
  提交前务必 `git status --short` + `git diff --stat` 看清在途内容，按子功能小步提交。
- **远程落后**：`origin/main` 停在 `5325997`；本地 `main` HEAD 在 `bbf7f29`，相差大量提交未推送。
  早期卡住原因：① `.gitignore` 曾误排除 142MB 二进制；② Clash 代理(7897)切断 git 长连接。
  代理规则已写入注册表 `ProxyOverride`（`super-tang.com`/`suzhou.super-tang.com`）与 `no_proxy` 环境变量，
  普通请求已明显变快，但 138MB 仓库整体推送仍卡在打包/长连接阶段。
- **Bug1（刷新云曲库按钮失灵）—— ✅ 已修复并实测通过（2026-10-10）**：
  根因与修复见上轮记录。`node --check dist/library.js` 通过；浏览器实测 `scripts/check-refresh-button.cjs`
  （连点两次 `.library-refresh`）断言 `disabled` 每次都复位为 `false`，PASS。死锁已解除。
- **Bug2（Daw→五线谱卡"正在准备后续谱面"）—— ✅ 已修复并实测通过（2026-10-10）**：
  真因：`dist/app.js` 的 `view('daw')`（约第 596 行）切到 Daw 时会
  `$('notation').lazyEngravingObserver?.disconnect()`；而 `setNotationMode` 第 667 行在
  `liveNotationKey===liveKey && 已有 svg` 时**早退**（`fitVisibleScore();refresh();return;`），
  完全跳过了 `activateLazyEngraving`，导致占位块失去 observer 永久残留。
  修复：在该早退分支补上 `if(mode==='engraved')activateLazyEngraving($('notation'),score);else activateSimpleNotation($('notation'))`
  （与 668/683 行逻辑一致）。浏览器实测 `scripts/check-daw-switch-lazy.cjs`：打开大谱（6 个懒块）→
  Daw→五线谱切回后 `lazyEngravingObserver` 重建、逐块滚入视口后占位块归零，PASS。

- **Bug3（琴谱库显示"暂不可用，点击刷新重试"）—— ✅ 已修复并实测通过（2026-10-10）**：
  根因：经公网隧道访问 `/api/scores` 偶发连接中断（server.log 见 `ConnectionAbortedError: WinError 10053`
  发生在写 /api/scores 响应时），客户端拿到截断 body → `response.json()` 解析失败 →
  `reload()` 进 catch 显示"暂不可用"。前端原逻辑**无任何重试**，一次抖动即判死。
  注：服务端 `json_response`（server.py:640）已支持 gzip（浏览器带 `Accept-Encoding` 时 722KB→约 40KB），
  但偶发抖动仍可能截断，且原代码无兜底。
  修复：`dist/library.js` 的 `reload()` 把单次 `fetch+json` 改为**最多 3 次、退避 800ms 自动重试**，
  仅当总超时触发才停止；超时由 20s 放宽到 45s。浏览器实测 `scripts/check-library-resilience.cjs`：
  模拟前两次 /api/scores abort、第 3 次放行 → 加载出 1877 张卡片、无"暂不可用"文案、无报错，PASS。

- `WORKBUDDY_HANDOFF.md` - **Bug4（云曲库首屏流式渲染）—— ✅ 已修复并实测通过（2026-10-10）**：
  根因：原 `reload()` 把全部卡片先建进 `documentFragment`，最后 `list.append(fragment)` 一次性插入才可见。
  曲库有 1877 张卡片时主线程要先把上千个 DOM 全建好才显示，用户干等全量构建。
  修复：`dist/library.js` 渲染循环改为**首张卡片建好即 `list.appendChild` 立即可见**，其余卡片用
  `requestAnimationFrame`（`nextPaint`）分帧逐批追加（每批 STREAM_BATCH=24 张），主线程不被卡死。
  实测 `scripts/check-library-stream.cjs`：首张单独先显（cardsAtFirst=1，且此时 aria-busy=true 仍在加载），
  其余分帧补齐（span>8s 流式跨度），最终 1877 张全部就位，PASS；全量 check-frontend-syntax 97 文件 PASS。
  注：首屏绝对耗时受 /api/scores 接口返回速度影响（本机偶发 13s 服务端慢请求 + 测试链路代理），
  流式修复保证「数据一回来首张立刻显、不等全量建卡」；若要让接口偶发慢时也零等待，可加「缓存优先」
  （用 window.cloudLibrarySnapshot 首屏预显，后台再 fetch 更新）。

  - `WORKBUDDY_HANDOFF.md` 是完整历史流水账（多轮 AI 功能改造、品牌改名、500 排查、云曲库变慢等），
  本看板只放"当下"。改大逻辑前先翻 HANDOFF 对应轮次，别重复踩已记录的坑。

---

- **Bug5（云曲库缓存优先首屏）—— ✅ 已修复并实测通过（2026-10-10）**：
  目标：接口偶发慢（13s）/ 挂掉时首屏也不白等。复用已有 `window.cloudLibrarySnapshot` 机制：
  ① 渲染段抽成 `paint(data)`；② `reload()` 增加「缓存优先」——若内存或 localStorage 有
  ≤30 分钟内的快照，先用它**同步秒显首屏**，再后台静默 `fetchFresh()`；
  ③ 后台成功且与缓存指纹相同则**不重绘**（避免闪烁/丢滚动），不同才静默重绘到最新；
  ④ 后台失败则保留缓存显示（离线缓存），**绝不**显示"暂不可用"；
  ⑤ 每次 `paint` 把快照 `JSON.stringify` 写入 `localStorage`（键 `cloudLibrarySnapshot`）；
  ⑥ 模块加载时先从 localStorage 恢复 `window.cloudLibrarySnapshot`，让 **F5 整页刷新也秒显**旧列表。
  保留 `local` 语义（local=true 仍只用缓存不 fetch）。
  实测 `scripts/check-library-cache-first.cjs`：场景A（清缓存+延迟2s）首卡 2757ms；
  场景B（保留缓存+接口 abort）首卡 **573ms**、列表 1877 张、**无"暂不可用"文案**，PASS；
  全量 check-frontend-syntax 97 文件 PASS。

- **★ 2026-10-11 排查发现：浏览器类回归脚本在当前代理环境下会全部假失败**
  本机系统代理是 Clash Verge(127.0.0.1:7897)。Playwright 用 `channel:'msedge'` 时，
  Edge 会读系统代理并把 **127.0.0.1 也当远程地址**发往代理 → 连不上 5173 →
  报错 `URLError [WinError 10061] 目标计算机积极拒绝`，且是**秒级失败**（1~3s），
  看起来像"AI 坏了"，其实**产品是好的**。
  实测证据：直接用 Python(UTF-8) 打 `/api/workspace-ai` → HTTP 200、4s 正常回复、
  自称 "SUPERTANG AI"（身份正确）。
  **修法（新脚本务必照做）**：launch 时显式指定代理并绕过回环——
  `chromium.launch({channel:'msedge', proxy:{server:'http://127.0.0.1:7897', bypass:'<-loopback>'}})`
  注意：`no_proxy` 环境变量、`proxy.bypass:'127.0.0.1,localhost'`、`--proxy-bypass-list`
  这三个**对 Edge 都无效**，只有 Playwright 的 `<-loopback>` 关键字生效。
  受影响的老脚本（未加 bypass，当前会假失败）：check-ai-identity / check-ai-stream-progress /
  check-ai-retract / check-ai-control-actions / check-ai-action-guard / check-ai-library-visibility
  （即 `check-ai-regression.cjs` 里那 7 项 FAIL 的真实原因）。

- **Bug6（AI 连续对话卡死）—— 前端 3 处已修并验证（2026-10-11）；服务端根因待办**：
  **已修（dist/workspace-ai.js，已备份 .bak-20261011）**：
  ① **busy 期间不再把"发送"当成"停止"**：原 `if(busy){cancelledByUser=true;abort()}` 会把用户
     打好的下一句话当成停止指令吞掉（9 轮对话 0 轮成功的主因）。现在分情况：
     输入框有内容 = 提问 → **排队**等这一轮做完（提示"这句先排队"）；空着 = 真要停止。
     实测 `scripts/diag-ai-queue.cjs`：busy 期间发第二句 → 出现"先排队"、**无"已停止"** ✅
  ② **曲库读取失败降级**：`readCloudLibrary()` 超时 15s→25s，且失败时不再让整条 AI 请求陪葬
     （有旧快照用旧的，没有就空着继续问 AI，console.warn 留痕）。
  ③ **超时文案不再甩锅外网隧道**：原"请检查外网隧道连接"→ 改为说明可能是谱面较大/本机较慢，
     并指向 5173 服务日志（代码 547 行注释自己都承认过这句是误导）。

  **★ 服务端根因（已修并重启验证，2026-10-11）**：
  根因确诊：冷 `/api/scores` 构建要遍历 4.4GB 缓存目录、逐首读文件，吃满 GIL 把整个 Python 进程
  拖死 16~30s，期间 `/api/health`、`/api/scores` 等所有动态接口无响应（实测 health 被拖到 3.4s、scores 16s+ 失败；
  这正是 AI 开谱时"卡死"的真因——不是 OMR 重算，是该列表接口在并发/冷启下反复全量重建）。
  **已落地修复（server.py + dist/task-center.js，均已 py_compile / node --check 通过 + 重启 5173 实测）**：
  ① `server.py` 给 `/api/scores` 加**列表级响应缓存**（`_SCORES_LIST_RESP`，按 `digest集合+各文件签名+任务状态`
     算指纹，命中即跳过逐首读文件的重建）：实测冷构建 1.68s → 热调用 **0.12s**（跳过重活），数据一致(1885 首/727KB)。
  ② `dist/task-center.js` 轮询从固定 2200ms 改为 **4s 基准 + 超时指数退避(≤20s)**，降低 AI 推理期间对繁忙服务的叠加压力。
  ③ 顺手清理了"两份并存"：原有两个无人监管的游离 server.py 实例(5173+5199)，现已统一杀掉、改由
     `launch.py piano` 守护进程拉起并监督 5173（崩溃 5s 自愈），符合恢复手册"只用 launch.py 一种方式"的要求。
  **仍待观察/可选**：开谱瞬间 `read_cached_score` 的 OMR repair-on-read（对未规范化大谱会重写文件）是否仍构成单请求重活，
  未改动（涉及正确性，需单独评估）；若日后复现"开单首大谱慢"，再单独处理。

  **已证伪的假设**（别再往这两个方向查）：
  - context 体积不是瓶颈：368KB 完整曲库 context 直连后端 **0.1s** 就返回且 action 正确。
  - 静态资源/OSMD 不慢：1.17MB 的 opensheetmusicdisplay.min.js 直连 0.038s(gzip)/0.065s(原样)。

- **Bug7（★真正的总根因：AI 动作从不执行 + busy 永久卡死）—— ✅ 已修复并实测 9/9 轮通过（2026-10-11）**：
  这是比 Bug6 更深一层的根因，**它解释了「AI 说了要做什么但界面毫无反应」和「busy 永远回不来」这两个现象**。
  - **症状**：点「打开《知足》」，AI 正常流式回「打开《知足》…」，但曲名一直停在「演奏工作区」；
    速度/静音/播放全都不动；发送按钮永远显示 ■（busy）；之后每一句都只能回「上一条还在处理，这句先排队」。
  - **真因（dist/workspace-ai.js `requestAI`）**：读 SSE/ndjson 的循环**只在 `done`（连接关闭）时跳出**。
    但实测这条流在浏览器里迟迟不关闭 → `reader.read()` 一直挂着 → `requestAI` **永不返回** →
    `runActions()` 永远不被调用 → **模型返回的 actions 一个都没执行**，同时 `finally` 里的
    `busy=false` 也永远跑不到 → busy 永久卡死。（`result` 事件其实早就带 actions 到了，只是没人跳出循环去用它。）
  - **修复**：收到 `result` 事件即视为流终点 —— 跳出循环并 `reader.cancel()` 主动断开，不再等服务器关连接
    （标准 SSE 客户端模式）。这是**一处改动、收益最大**的修复。
  - **验证**：`scripts/check-ai-musician-dialogue.cjs`（音乐家 9 轮连续对话）**9/9 全过、0 失败** ——
    轮1 真的把《知足》打开了（title=知足）、轮3 速度改到 92 并开始播放、轮4 钢琴声部真的被静音、轮9 真的停止播放。
    探针：`scripts/diag-decisive.cjs`（抓 open 派发次数 / busy 按钮 / title 随时间变化）。

  **★ Bug7 修好后暴露的下一层（同一会话续做，均已处理）**：
  - **补代理绕过**：`audit-ai-live-dialogue / check-ai-advanced-e2e / check-ai-control-actions / check-ai-action-guard`
    的 `chromium.launch` 原本都没带 `proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}` → Edge 把
    127.0.0.1 当远程走 Clash、秒级 10061 假失败。**已补齐；新增浏览器测试脚本务必带这个 bypass。**
  - **修「只答应不给动作」无提示**：模型只回话、**不发动作**、且回复是「我来处理/已打开…」承诺措辞时，
    前端原刻意不追加提示 → 用户看到"已打开"却毫无反应且无警告。已加**保守**警告（仅此情形提示，
    纯乐理问答不提示，避免误报）。`check-ai-action-guard.cjs` 该项 FAIL→PASS。
  - **修测试误报**：音乐家脚本原正则 `/已停止这次请求|界面没有变化/` 太宽，会把 runActions 的**正常**
    校验警告「子操作执行后界面没有变化」误判成"卡死"。已拆分为「已停止这次请求=真卡死」/「执行后界面没有变化=动作未生效」。
  - **真实模型审计 5/5 轮状态全对**（`audit-ai-live-dialogue.cjs`）：切简谱/钢琴独奏、调速80/开节拍器、
    播放+多声部静音，state 变更全部正确；轮1 模型漏发 open 被 `ensureScoreOpened` 兜底救回并成功开谱。
  - **已知遗留（模型质量，非前端 bug）**：① 问「哪小节转调」这类"定位+回答"时，模型常只发 seek 动作、
    不在文字里给答案；② 偶发**回复跑题/幻觉**（实测轮1 答成"古典时期奏鸣曲选曲"）。动作仍可靠（Bug7 已修），
    但**文本质量**偶有偏差，勿与"动作没执行"混淆。

  **★ longflow 60 条回归：58 PASS / 2 FAIL（Bug7 修复前几乎全灭）→ 2 个均已定位并修掉**：
  跑法：`node scripts/check-ai-longflow.cjs`（**必须先补代理绕过**，否则 Edge 走 Clash 秒级 10061 假失败）。
  ★ 关键手法：给 longflow 脚本加了 **SSE result 捕获**（`rec.sseActions`，用 `page.addInitScript` hook `fetch`
  读响应克隆流），能看到后端**真实下发**的动作数组 —— 判断「界面没生效是模型没发、还是前端没执行」的决定性证据。
  注意 `scripts/_longflow-result.jsonl` 是**累积**文件（多次运行叠加），取结果要用 `recs[-60:]` 只看最后一批。

  - **Bug8（查不到位置就把同句其它动作全吞了）—— ✅ 已修**（`ai_workspace.py` 新增 `_leftover_actions`）：
    「跳到 X 最早出现处」查不到时原本直接 `actions:[]` 一把梭，把同句里**完全能执行**的
    「只听鼓组」「开始播放」一起丢掉，reply 还只谈"查不到位置"。现在只降级「跳转」这一项，其余照做并如实说明。
    ★ 踩坑：`ONLY_RE` 是「只听|单独|只要|只留」四选一，**不能**用 `ONLY_RE.pattern + '(...)'` 拼捕获组 ——
    组会落在最后一个分支之后 → `m.group(1)` 为 None → `AttributeError` → 整条请求 **502**。改为显式枚举四个词。
  - **Bug9（★换曲把刚设好的声部冲掉）—— ✅ 已修**（`ai_workspace.py` `plan_locate`）：
    原来 `actions.insert(0, solo)` 把独奏顶到**最前**；但命中**另一首**时 actions[0] 是 open，
    而 open 走 `setScore()`，其中 `soloSelect.replaceChildren()`（app.js:616）会**重建整个独奏下拉框**并复位成 `all`
    → 排在 open 后面的 solo/mute 全被冲掉。
    实测 longflow #48 真实动作为 `[solo:P10, open:情歌王2024, seek:52, play]`（solo 在 open 前），
    独奏被冲回 all、AI 却说"已经跳过去开始播放了"，**历史 16 次全 FAIL**。同一句话不触发换曲就正常，所以一直藏着。
    修法：solo 排到 open **之后**；另在动作收口处加**稳定排序**兜底（任何 `open` 提到最前）。
    验证：`node scripts/check-ai-longflow.cjs --only 48` → **1/1 PASS**，`after.solo=P10`。
  - **longflow 判定过早（测试缺陷）**：换曲类多步用例 `open`(14s) + `seek`(最多 15s 兜底) 总耗时可达 30s，
    脚本固定 `sleep(4500)` 就读状态 → 误判"没生效"。已改为轮询等 AI 真空闲
    （发送按钮回 `'↑'` 且 `ai-executing` 消失，上限 40s）。

## ★ 曲谱课堂浏览器测试（2026-10-11 夜，用户要求）

入口：设置区折叠面板「曲谱课堂」（`dist/workspace.js:107` 懒加载 `score-classroom.js`，引擎 OpenMAIC）。
测试：`scripts/check-score-classroom-flow.cjs`（覆盖展开全屏 / 试听暂停 / 章节习题反馈 / 流式提问 /
练习范围配置 / 全屏与移动端布局）。**该脚本原本也没带代理绕过，已补。**

- **Bug10：流式提问在完整答案后面追加「signal timed out」—— ✅ 已修**（`dist/score-classroom.js`）
  这正是 **Bug7 的同款模式**：读取循环只在 `done`（连接关闭）时跳出，而这条流迟迟不关闭 →
  `reader.read()` 一直挂着 → 最后撞上 `AbortSignal.timeout(120000)` → 把错误文本
  `'\n'+error.message` 追加到**已经完整**的答案后面。
  用户视角：**等满 2 分钟，答案出来了却跟着一句 "signal timed out"**，以为失败了。
  修法同 Bug7：收到应用层终点 `event.done` 即收工 + `reader.cancel()`，不再等服务器关连接。

- **★ 顺带全项目扫出并修掉同款 SSE 卡死（共 3 处，都是「只在 done 跳出」）**
  排查命令：`grep -rn "if(done)break\|if(done){.*break" dist/*.js`
  1. `dist/workspace-ai.js:501`（`/api/scores/search` 的 skill/web 搜索）→ 收到 `result` 即收工。
  2. `dist/library.js:250`（曲库内搜索）→ 结果早收到了、但套用结果的代码在循环之后，
     **界面一直转圈**，要等 75 秒超时才刷出结果。修时注意 **partial 是中途结果**，
     只在「非 partial 的最终 result」到达时才 break，否则会在中途结果上提前收工。
  3. `dist/score-classroom.js`（见 Bug10）。
  ✅ 已确认无遗漏；`app.js:286` / `library.js:72` / `vocal-transport.js:52` 是**二进制下载**
  （累加到流结束），写法正确，不要误改。

- **测试口径过时（非回归）**：`check-ai-library-visibility.cjs` 还要求 `context.library` 曲名索引存在，
  但该索引已于 2026-10-11 **有意移除**（前端注释：后端会整个丢掉它、模型从不读，56KB 白传）。
  已把断言更新为守住**真正**的不变量：① library 应已停用；② scores 必须是上下文第一个键且覆盖全库、
  id 为完整 64 位；③ 后端**全库检索**通路可用（Node 侧直打后端核对，注意响应是 ndjson 不能用 `.json()`）。
  注：前端载荷仍有 30 万字符，但**不是**风险点——后端只把「与本次对话相关的曲目」发给模型并 20000 字符封顶
  （`ai_workspace.py:1820` `_keep` + `1828`），且明确告知模型这不是全库、要全库检索用 `library_query`。

## 待认领（带着上下文来）

- **[Bug1 / Bug2] 均已修复并实测通过（2026-10-10）**，见上方「在途工作」。回归探针：`scripts/check-refresh-button.cjs`（Bug1）、`scripts/check-daw-switch-lazy.cjs`（Bug2）。

- **[推送] 138MB 仓库经代理推不上去**
  候选方案（需用户拍板）：① 关掉 Clash 代理直连 GitHub（用户网络可能不通，需试）；
  ② `git gc --aggressive` 后浅推；③ 分多次小提交逐步推；
  ④ 等大仓库瘦身（`.gitignore` 已排除大二进制，但历史已含，需 `git filter-repo` 才有用，风险高）。

---

## 验证命令速查（改完必跑，浏览器类必须串行）

```bash
# JS 语法（秒级，改完立刻跑）
node --check dist/library.js
node --check dist/engraving.js
node scripts/check-frontend-syntax.cjs        # 扫全部 dist/*.js

# Python 编译（改完立刻跑）
python -m py_compile server.py ai_workspace.py ai_web_import.py

# 改完 Python 必须重启 5173 才生效（server.py 是进程内模块）
# 正确启动：cd <部署侧 frp 目录> && pythonw launch.py piano
# 本机测接口要加 --noproxy：curl --noproxy '*' http://127.0.0.1:5173/api/scores

# 浏览器类（每个都启 msedge，必须逐个串行，并行会抢服务误报）
node scripts/check-refresh-button.cjs         # Bug1：刷新云曲库按钮连点不再死锁
node scripts/check-daw-switch-lazy.cjs        # Bug2：Daw→五线谱切回后懒加载占位块全部渲染
node scripts/check-full-large-switch.cjs      # Bug2 复现（旧）
node scripts/check-ai-regression.cjs          # AI 功能回归（12 项快，约 6 分钟）
node scripts/check-ai-regression.cjs --long   # 加 60 条长流程（约 30 分钟）
```

---

## 看板维护约定

- 每完成一小步，更新 `## 活动任务` 表对应行的"状态 / 最近更新"。
- 占锁就写 `## 文件锁`，释放就删；别让锁长期挂着（别人会以为文件被占）。
- 大进展同步写进 `WORKBUDDY_HANDOFF.md` 对应轮次；本看板只反映"当下"。
- 会话结束前，把自己占的锁清掉、把未完事项挪到"待认领"。
