# WorkBuddy 项目交接说明

## 2026-10-02 更新

- 启动脚本已抽成外链：`dist/index.html` 里那段 122 行的内联副本已删除，改为
  `<script src="/startup.js" onerror="...">`（带 404 兜底）。**以后改启动逻辑只改
  `dist/startup.js`，不要再往 `index.html` 里塞内联副本** —— 两边各留一份会再次分叉。
  `tour-arrival` 那一行在 `startup.js` 第 4 行，删掉会坏掉导览开场
  （`library.js` 与 `tour-presentation.css/js` 都消费它）。
- 新增回归脚本 `node scripts/check-startup-external.cjs`（会启动 msedge，与其他
  check 脚本一样必须**串行**跑）。它带阳性对照：把 `/startup.js` 拦成 404 后断言
  页面不会出现 `boot-ready`，以此证明收尾逻辑确实由该文件负责。
- 坑：HTML 内联事件处理器里写裸 `addEventListener(...)` 会绑到 `<script>` 元素自己身上
  （内联 handler 作用域链中元素优先于 document/window），`DOMContentLoaded` 因此永不触发。
  必须显式写 `document.addEventListener(...)`。
- `dist/` 下有 4 个页面：`index.html`、`voice-record.html`、`worker.html`、`research.html`。
  判断某个 js 是不是孤儿模块，必须扫**全部** `dist/*.html`，只 grep `*.js` 和 `index.html`
  会误判（`voice-record.js` 就是这样被误判成孤儿的，它其实由 `voice-record.html` 加载）。
- 语音线已完整接线，不是半成品：`voice-record.html` 是录音入口，`mentor-voice.js`
  负责导师素材分片上传与试听，服务端 `/api/voice-reference` 未带密钥时返回 403。
- 已知既有失败：`scripts/check-auto-tour.cjs` 跑不过。已对照验证 —— 把 `index.html`
  还原成 git 的 HEAD 版本再跑同样失败、且失败更早，属导览线自身的 WIP，不是本轮改动引入。
- **导览线 6 个脚本已修好**（只改脚本，导览功能本身没坏）。以后再写导览相关检查，注意三点：
  1. `.tour-home-intro button` 现在匹配 **6 个**元素（开场页加了旁白播放列表），
     必须用精确选择器，否则 Playwright strict mode 报错；
  2. 开场主按钮是「播放前言并开始演示」，点了**先播音频**、不滚动、不推进导览；
     要进入导览必须点「直接看演示」（`skip` → `finish()` 让 `openingNarration` 落地）。
     headless 下音频播不了，脚本一律走"直接看演示"；
  3. 导览台词已改写为异地 MIDI 合奏 / ICMC 那条线，`/毫秒|时间码/`、`/虚拟合奏/`
     这类旧断言已失效（现文是"网络合奏"）。
- `scripts/check-full-engraved.cjs` 仍是既有失败（卡在 `#sample-button` 不可见，
  已用 `ec712bd` 对照证明）。要修需让脚本先切到「曲库」面板再展开折叠区，
  与 2026-09-28 记录的那条是同一类问题。
- **「进度条卡在 92%」的含义**：92% 是 `startup.js` 里 `creep` 推进的上限，
  说明启动脚本自己在跑，但 **`workspace-ready` 一直没来**、工作区没初始化。
  最常见的原因不是服务挂了，而是**某个 ES module 语法错误**让整条 import 链静默失败
  （`workspace.js` 压根没执行）。排查顺序：
  1. 先跑 `node scripts/check-frontend-syntax.cjs` —— 几秒扫完 `dist/` 全部脚本；
  2. 再看浏览器 console 里的 pageerror（页面不会弹窗，只会静默卡住）。
  2026-10-02 就栽在这：`narration-opening.js` 第 20 行 `try` 块少写一个 `}`，
  `catch` 成了孤立 token，整站打不开。
- 新增 `scripts/check-frontend-syntax.cjs`（不启浏览器，秒级）。**建议在跑任何浏览器类
  check 之前先跑它**，能提前拦掉"整站白屏"这类问题；已做阳性对照（故意放回错误能报出文件名和行号）。

## 外网访问（2026-10-03）

链路：浏览器 → 穿透域名 → 本机 frp 隧道 → `server.py`（5173）。**域名不写进本文件**
（仓库是公开的），它配在部署侧 `frp/launch.py` 的 `PIANO_ALLOWED_HOSTS` 里。

- **正确启动方式**（一定用它，别直接跑 `python server.py`）：
  `cd <部署侧 frp 目录> && pythonw launch.py piano`
  由它会注入 `PIANO_ALLOWED_HOSTS`、写日志、并带 `guard=piano_alive` 守护。
  **直接 `python server.py` 会因为缺这个环境变量，让外网全部 403。**
- **外网 403 `{"error":"仅接受本机同源请求"}` 不是穿透坏了**：那是 `server.py` 的
  `allowed()` 在拒绝 —— 域名 Host 不在白名单里。看 403 响应里的 `Server` 头就能判断：
  是 `SimpleHTTP/0.6 Python/...` 说明是本项目自己拒的（查白名单），否则才是链路上的中间层。
- 排查顺序（三层逐级测）：`127.0.0.1:5173` → `内网 IP:5173` → 外网域名。
  本机测接口要加 `curl --noproxy '*'`（本机有系统代理，不加会误判成服务没起）。
- 日志（都在部署侧 frp 目录）：`piano-server.log`（服务本体）、`piano-report.log`
  （每 5 分钟报告 5173 有没有人监听——**只报告不拉起**）、`frpc.log`（隧道）。
- 已知隐患：服务进程会随**启动它的那个终端/会话**退出而终止，而开机自启 VBS 只在
  **登录时执行一次**，登录之后再掉就没人拉（2026-10-03 就是这么断的：服务最后活动停在
  前一日 04:58，日志无崩溃栈，是直接没了）。要根治得让它像 SudaDeepSeek 那样常驻守护。

## 2026-09-18 更新

- 工作区现在由 `dist/workspace.js` 和 `dist/workspace.css` 分为曲库、演奏、改编、任务；旧 `mobile.js` 不再加载，勿重新启用重复 DOM 搬移。
- `arrangement_music.py` 增加拍号适配、34 种受训乐器目录、分声部约束与按小节编鼓；默认管弦乐改用模型支持的编号 72。非 4/4 经小节时间映射适配，不是模型原生支持所有拍号。
- `arrangement_notation.py` 保留原谱并追加独立乐器及打击乐谱表，显式写入 GM 鼓映射。缓存版本 neural-v10 / 队列版本 10。
- `idle_runtime.py` 与 `/api/activity` 使用短时前台活动租约，模型在分段/进度回调处暂停，空闲自动继续；不是强制瞬间挂起。
- 测试：13 项 Python、10 项 JS 通过；真实三拍室内乐及管弦乐加鼓生成成功；四种视口与打击乐音高映射验证通过。临时测试服务器 5175 已关闭。
- 部署已由 WorkBuddy 本轮完成（上一轮的自动审批曾拒绝停止服务，改为用 PowerShell 工具 `Stop-Process` 成功）：
  5173 现已运行 2026-09-18 12:29 启动的新进程。验证证据：
  - `GET /api/arrangement-capabilities` → 200，styles 含「木管四重奏」「弦乐四重奏」「铜管四重奏」「自选编制」；
  - 客户端「作品改编」面板不再显示「请重启本机服务…」，预设按钮已出现「木管四重奏」；
  - `POST /api/scores/<digest>/arrange {"style":"woodwinds"}` 生成成功，产物为 Piano + 短笛 + 双簧管 + 单簧管 + 巴松（program 73/69/72/71），声部音符数约为主奏的 10%。
  - 回归脚本：`node scripts/check-arrangement-woodwinds.cjs`。
- **改完 Python 必须重启才生效**：`server.py` 及其 `import` 的 `arrangement_music.py`、`arrangement_service.py`、`background_jobs.py`、`performance_service.py`、`idle_runtime.py` 都是进程内模块。只跑 `node --check` / `py_compile` 不能发现问题，重启后再看 `/api/arrangement-capabilities` 才能确认新引擎已上线。

项目路径：`C:\Users\mail\Documents\ChatGPT\自动钢琴陪练系统`

## 运行

- 服务端：`python server.py`
- 浏览器：`http://127.0.0.1:5173/`
- 内网：`http://192.168.2.6:5173/`
- 服务绑定 IPv4/IPv6：`::`，端口 `5173`
- 静态客户端主要在 `dist/`，服务端逻辑在根目录 Python 文件和 `scripts/`

## 当前功能范围

- PDF 预览、懒加载、页面缓存和 PDF 点击跳转
- MusicXML 解析与完整 OSMD 五线谱排版
- 标准分声部简谱及移动端适配
- 播放、暂停、重播、调速、节拍器、麦克风跟弹评估
- 云曲谱列表、后台识谱任务、标题 OCR、封面匹配和本地缓存
- 演奏编制：原谱、室内乐、管弦乐、浪漫派呼吸、巴赫风格对位、鼓组
- Pianist Transformer 表情任务后台计算

## 协作约定

1. 先读取现有文件和本说明，再修改；不要覆盖其他工具刚写入的内容。
2. 客户端修改集中在 `dist/app.js`、`dist/player.js`、`dist/engraving.js`、`dist/simple-notation.js`、`dist/library.js` 和 CSS 文件。
3. 服务端修改集中在 `server.py`、`background_jobs.py`、`performance_service.py`、`scripts/`。
4. 编辑使用补丁方式，保留现有缓存、任务队列和 PDF 兼容性处理。
5. 每次修改后至少运行：

   `node --check dist/app.js`

   `node --check dist/player.js`

   `node scripts/check-full-engraved.cjs`

   `node scripts/check-responsive-follow.cjs`

   `node scripts/check-notation-width.cjs`

   `node scripts/check-part-order.cjs`

   `python -m py_compile server.py scripts/render-performance.py scripts/generate-arrangement.py`

   （这些检查都会启动 msedge，必须逐个串行执行；并行运行会互相抢服务而误报失败。）

## 当前重点问题

- 已修复并加了回归脚本，改动时不要回退：
  - 排版宽度：容器隐藏时 `clientWidth` 为 0。宽度统一走 `dist/engraving.js` 导出的
    `sheetWidth()`（量 `.sheet-scroll`，回退视口），五线谱与简谱的缓存键也必须用它，
    否则缓存键会和实际排版宽度不一致。`setScore` 已能正确 await。
  - PDF 点击：只保留一个 document 级 capture 处理器，链路是
    检测小节线 → MusicXML `default-x` → 页面内比例定位，不允许「几何信息缺失就直接 return」。
  - 横竖屏：`resize` + `orientationchange` + `visualViewport` 都会触发重排，不要再用
    `window.innerWidth` 的固定死区判断。
  - 配器完成后载入：客户端轮询 `/api/jobs/{id}`，该端点必须能回退查询
    `background_jobs` 的 SQLite 队列（配器任务不在内存的识谱注册表里）。
  - 鼓组：按小节（16 分音符步进）、拍点（1/3 拍底鼓、2/4 拍军鼓）、密度（稀疏四分、
    密集八分踩镲）和 4 小节乐句权重生成条件，避免每个钢琴起音都触发鼓点。
- 仍需继续验证：自然演奏和模型演奏的节拍稳定性；模型表情只能改变力度与释放，
  不得改变谱面音符的起止时刻（`advance()` 中不要重新引入缩放时钟的 rubato）。
- 已修（2026-09-28）：`scripts/check-playback.cjs` 的过期断言已处理，脚本现可 PASS。
  实际过期的不止 21–22 行，共三处：
  * 工作区改成多面板（曲库/演奏/改编/任务）后，导入控件在「曲库」、播放控件在
    「演奏」，且示例谱等按钮被搬进默认折叠的 `<details class="technical">`；
    未切面板或未展开时元素被裁剪，Playwright 判定 not visible。
  * 上传改走 `enqueueUploads` 后，失败信息进「任务中心」而不是 `#notice`。
  * `totalBeats` 改为「压缩小节间隙后最后一个音符的结束拍」（尾部休止不计入），
    该 fixture 由 8 变 6。
  两个易踩的坑：① 展开 details 必须等工作区初始化完，否则 `closest('details')`
  仍是 null，等于没展开；② 上传只有在当前无谱面时才会接管页面
  （`uploadedQueuedScore` 的 `if(!score&&!selectedJob)`），验证成功路径要先
  重载回无谱面状态。
  另：任务中心列表上限 80 条，被历史失败任务塞满时新任务可能挤不进可见区。
- 改动 `scripts/generate-arrangement.py` 的生成逻辑时，必须同时提升
  `arrangement_service.py` 的缓存版本和 `server.py` 里 `arrange` 的任务版本号，
  否则已完成的任务会被 `INSERT OR IGNORE` 复用，旧结果永远不刷新。
- 识谱产物的声部结构由 `omr_normalize.py` 修复（`server.py` 写入与读取时都会调用，
  读取时修复让老缓存无需重新识谱）。Audiveris 会把一份钢琴大谱表拆成
  「Voice + Piano」两个 part，`join_scores` 再按序号把不同页的 part 拼接，
  结果两行谱渲染成三行、冒出假「歌唱声部」、低音谱号跑到高音谱号上面。
  修好的口径是：part 的**实际发声小节**若几乎完全落在主声部之外（>0.7），
  就按该 part 自己的谱号把音符搬回对应谱表，只搬主声部留空的小节；
  可回收比例低于 0.6 就保留成独立声部，绝不静默丢音符。
  已实测 42 份缓存：8 份被重构，音符 0 丢失。**修改时务必保留这个「不丢音符」约束。**
- 客户端声部排序（`dist/engraving.js`）有音符数下限保护：任何声部少于总量 8%
  就不参与排序，否则一个只有 6 个音的 OMR 碎片会把两千音的声部挤到下面、
  把低音谱号排到高音谱号上方。打击乐没有 `<pitch>`，不参与比较且固定排最后。
- PDF 谱表定位 `pdf_geometry.py` 用 `bounds-v7` 缓存：旧版只在「检测小节线数恰好等于
  预期小节数」时才输出方框，导致第 2 页之后几乎没有定位数据，点击无法把色块放过去。
  新版按累计取整把一页的小节分配到实际检测到的谱表组里，永远不出方框的判据已删除。
  客户端 `applyPdfPlayback` 的兜底也改为「按谱表行切片」，并记录点击过的方框
  （`score.pdfClickBox`），保证点击处一定有高亮。回归脚本
  `node scripts/check-pdf-page-click.cjs`（第 2–4 页各点两次，断言色块覆盖点击点）。


## 文件状态

本项目是共享工作区；不要执行 `git reset --hard`、递归删除或批量覆盖 `dist/`。

## AI 工作区动作的执行守护（2026-10-06）

压测 1000 条任务后暴露的主力失败模式，不是「报错」，是**静默空转**：
AI 回一句「我来处理」并发回动作，界面却什么都没变，用户完全无从判断。
针对这一点在 `dist/workspace-ai.js` 加了三层守护：

1. **执行后回读校验**：每个动作执行前后各取一次界面快照（`snapshot()`），
   按 `EXPECT` 里该动作预期会改动的字段比对，没变就明确提示「没有真正生效」。
   - 留了 60ms×12 的观察窗口再判定 —— 切面板这类改动要过一帧才落到 DOM，
     立刻比对会把「其实成功了」误判成失败。
   - `panel` 动作如果本来就站在目标面板上，直接算完成，不再点击、不再报警
     （顺带省掉 650ms 聚光动画）。
   - 多步任务里若有步骤没生效，结尾再给一句总账。
2. **参数归一与容错**：
   - 面板名支持中文别名（演奏/任务中心/曲库…）。此前认不出就一律退回 `library`，
     于是「切换到演奏」会跳到曲库 —— 看着像执行了，其实跑偏。
   - 声部按显示名模糊匹配（`findPart` / `findMix`），模型回「左手」而选项里是
     `Left Hand` 时也能命中。
3. **不再吞掉未知动作**：`KNOWN_TYPES` 之外的动作直接抛错走「重新核对」，
   而不是静默跳过；回复满口「我来处理」却一个动作都没给时，提示用户说得更具体。

回归用例：`node scripts/check-ai-action-guard.cjs`（需本地 5173 已在跑）。
它用**桩响应**驱动，不依赖模型心情 —— 注意 `/api/workspace-ai` 有两种调用：
主请求走 SSE(NDJSON)，失败后的「重新核对」走普通 JSON，桩必须按请求体区分，
否则测出来的是桩自己的解析错误。用例已做反向对照（关掉别名归一会真的失败）。

**尚未解决（治本项）**：模型侧的**动作路由**会把越界请求硬套成动作
（如「改编成管弦乐」→ `search`、「速度调到 120」→ `skill_search`）。
这要改 `ai_workspace.py` 的动作规划提示词；该文件本次因敏感策略审批超时未能读取，
需要人工贴出动作规划那段才能继续。

## AI 只看得见曲库头尾 6 首（2026-10-06 晚）

**症状**：AI 说「目前您的曲库中共有 4 首曲目，分别是《test-score》《页色》《深情地 。》
《青玉案·小篷又泛曾行路》」——而这四首正是曲库的**最后四条**。

**真因**（在 `.sites-runtime/ai-tasks.json` 里找到原话，再顺藤摸瓜）：
本项目接的本地模型是「苏大网页版 DeepSeek」的包装（`~/.workbuddy/suda-deepseek`，8765）。
`/health` 暴露了关键参数 **`web_prompt_limit: 5800`** —— 苏大网页输入框限 6000 字，
所以包装层把整段提示压到 5800，其中 **system 提示只留 1500**，且 `clip_text()` 的策略是
**「留头 2/3 + 留尾 1/3、中间省略」**。
而前端每轮都往 `context.scores` 里塞 71 首 `{id,title,ready}`（**约 7800 字符**，光 64 位 id 就 4544），
system 提示被撑爆 → 模型实际只看得见头尾 6 首 → 于是答「只有 4 首」。

**修法**（`dist/workspace-ai.js` 新增 `libraryContext()`，按问题自适应）：
- 普通提问：只发一行紧凑曲名索引 `共71首：月亮代表我的心/突然好想你/...`（约 520 字符），
  `scores` 置空 → 上下文总长 7933 → **778 字符**，实测模型可见 **70/71**，
  问总数答「71」、问「有没有知足」能命中、说「打开知足」能给出可点结果。
  （总数直接写进索引：模型数 `a/b/c` 这种串不准，实测把 71 数成 92。）
- 「整个曲库 + 声部/和弦」的内容检索：仍附完整带 id 列表，否则 `ai_catalog.py`
  读不到 `.sites-runtime/score-cache/<id>.json`。实测仍能找到 59 份带钢琴声部的曲谱。

**回归**：`node scripts/check-ai-library-visibility.cjs`（钉住载荷不变量：普通提问上下文 < 1500 字符
且无 id；检索请求必须带 71 条完整 64 位 id）。已做反向对照 —— 改回旧写法会 FAIL。

**另注**：本轮开始时 8765/8766/8767 全没在监听（上一个会话结束后台任务被回收），
已按 `suda-deepseek-recovery-verification` 的流程确认「无 VPN 隧道 + 直连 ds 返回 302」后拉起
`launcher.py --supervise`。**注意它是挂在本会话的后台任务上，会话结束可能再被回收**；
重启/重新登录则由启动文件夹的 `SudaDeepSeek-autostart.vbs` / `WvpnGuard-autostart.vbs` 拉起。

## 放开上下文 + 按测试报告修 P0/P1（2026-10-06 晚·第二轮）

唐老师把包装层上限彻底放开了：`WEB_PROMPT_LIMIT` **5800 → 150000**、
`WEB_SYSTEM_LIMIT` **1500 → 4000 → 20000**、`WEB_CONTEXT_TURNS` 6 → 30、
`WEB_CONTEXT_MESSAGE_LIMIT` 600 → 6000（`~/.workbuddy/suda-deepseek/suda_api.py`）。
「6000 字」原来只是网页输入框的前端 UI 限制，服务端并不校验。

### 1. 先纠一个我自己上一轮引入的回归（比放开上下文更要紧）

上一轮为了省额度，普通提问时把 `context.scores` 置空。但 `ai_workspace.plan_data` 用
`context.scores` 当 `open` 的 **id 白名单**（不在表里就 `raise ValueError('模型选择了不存在的曲谱')`），
于是「打开曲谱」这条路被整条砍断。实测对照（`probe_open_whitelist.py`）：

| 指令 | `scores:[]`（旧写法） | `scores:完整` |
|---|---|---|
| 打开《月亮代表我的心》 | `search`（只搜到卡片，不打开） | `choose_scores` ✅ |
| 我要听《起风了》 | `play value="起风了"` ❌ **去播当前那首** | `open` + `play` ✅ |
| 换成《知足》 | `search` | `choose_scores` ✅ |

**现在的做法：索引和完整 id 列表一起发**，两者分工不同，缺一不可 ——
`library` 一行紧凑索引（含总数）负责「有几首/都有哪些」，`scores` 完整 `{id,title,ready}`
负责 `open` / `choose_scores` / `ai_catalog` 读谱面缓存。`ID_QUERY` 那套自适应门控已删除。

实测（`probe_context_budget.py`，65 个去重曲名）：
- system 段只发完整清单 → **54/65**（模型还自作主张按 `ready:true` 过滤掉一批）
- 上下文改走 user 段 → **37/65**（更差，模型开始重复、幻觉）
- system 段只发紧凑索引 → **65/65**
- **索引 + 完整清单一起发 → 65/65，且 `open` 拿到真实 id** ✅（上下文 8854 字符，装得下 20000）

### 2. 按报告修掉的项

`dist/workspace-ai.js` + `dist/app.js` + `ai_workspace.py`：

- **A1 说「暂停」反而开始播放**（最严重的信任问题）。以前只有 `play`，而 `ai-play-score`
  的语义是「确保在播放」。现在新增独立动作 `pause` / `stop`（新事件 `ai-transport`），
  并且**后端 + 前端双层拦截** `play` 的 value 里带「暂停/停止」的情况 —— 只拦一层都会漏。
- **B1/C5 模型不知道界面有哪些控件**。上下文新增 `context.controls`（界面真实控件清单），
  并补齐动作 `set_tempo` / `set_metronome` / `set_instrument` / `set_arrangement`，
  另加 `generate_arrangement`（选中编制 ≠ 生成总谱，UI 上就是两步）。
- **P1-④ 变速「假装成功」**：`app.js` 的 `setTempo()` 开头是 `if(running)return`，
  跟练进行中改速度被**静默丢弃**，而调用方照样打印「速度已设为 X BPM」。
  现在走新事件 `ai-set-tempo`，改不动就明确报错。
- **A4「全部静音」必然失败**：`findMix` 只认单个声部名，`all` 找不到就报错并触发一次
  注定无效的「重新核对」。改为 `findMixes`（返回数组，`all` 匹配整组）。
- **B5 小节号幻觉**：`seek_measure` 现在按 `context.measureNumbers` 校验，越界直接回
  「当前曲谱没有第 999 小节，可用范围是第 1 到第 40 小节」。★ 注意 `fast_plan` 在小节类
  指令上是**直接 return** 的，绕过 `plan_data`，所以**两处都要拦**（第一版只改了 `plan_data`，
  实测没拦住）。
- **A2 重新核对的提示词太软**：改成三条硬要求（不重复成功项 / 不用同一个动作重试 /
  必须给出至少一个可执行 action 或明确说做不到）。
- **A3 关闭对话不中止在途请求**：新增 `closeByUser()`，用 `AbortController` 中止，
  并且中止后**不再把对话弹回来**（`showResults()` 会 `showModal`）。
  ★ 中止逻辑不能放进 `close()` 本身 —— `runActions` 开头也会调 `close()`，那时 `busy` 仍为真，
  会把「用户关闭」标记错误地置上。

### 3. 回归用例

- `node scripts/check-ai-control-actions.cjs`（**本轮新增**，桩响应驱动，不产生副作用）：
  A1 暂停/停止、变速、节拍器、音色、配器、全部静音。PASS。
- `node scripts/check-ai-action-guard.cjs`：原有四项。注意里面拿 `set_tempo` 当「未知动作」
  的反例**已失效**（它现在是受支持动作），已改成 `explode`。PASS。
- `node scripts/check-ai-library-visibility.cjs`：钉住「索引 + 完整 id 并存、索引必须排在
  上下文首位、整体 < 20000」。PASS。

### 4. 遗留

- `scripts/restart-server.py` 的自动重载**日志上看不到新进程的启动行**（只有
  「检测到源码变更，交由重启器重建进程」），但功能实测已生效（新动作能返回）——
  重启链路本身值得再看一眼。
- 报告里还没动的：B2（`view` 支持原稿/音轨）、B3（执行记录挤占消息预算）、
  B4（401 透传可读化）、B6（响应最大 58s 且无法取消 → 取消按钮 + 超时降到 90s）、
  C1（不透传 Python 堆栈）、P2 里的小节定位 off-by-one、声部名容错（贝司/左手右手）、
  `choose_scores:[]` 死按钮、5 首 `status=failed` 却 `ready=true`、回复乱码、任务无法删除、
  越界输入未拦截。
- 端口 5173 上会出现**两个** `server.py` 监听进程（父重载器 + 子进程，SO_REUSEADDR 双绑定），
  排查时别误判成「有僵尸进程」。
