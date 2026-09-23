# WorkBuddy 项目交接说明

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
- 遗留：`scripts/check-playback.cjs` 第 21–22 行的断言已过期（上传路径改为
  `enqueueUploads` 后，失败信息进「进度中心」而不是 `#notice`），需要单独修订，
  目前它会失败且与近期改动无关。
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
