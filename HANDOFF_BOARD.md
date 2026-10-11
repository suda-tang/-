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
| GitHub 推送（远程落后本地大量提交） | 阻塞：138MB 经代理推不上去 | **待解决（需用户拍板）** | 2026-10-10 |
| 建立本交接看板（多会话防互踩） | 进行中（本会话） | 2026-10-10 本会话 | 2026-10-10 |

---

## 文件锁

占锁 / 释放都改这一节。当前为空 = 暂无人在占锁。



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
