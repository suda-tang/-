# 交接现状简报（2026-10-02）

> 本轮为**只读勘查**，未修改任何文件、未重启服务。
> 结论供确认，确认后才动代码。

## 1. 交接状态

| 项 | 事实 |
|---|---|
| 项目路径 | `C:\Users\mail\Documents\ChatGPT\自动钢琴陪练系统` |
| git | 仓库存在，分支 `main`，最新提交 `ec712bd`（清理隐私信息并补齐工作区改动） |
| 已有交接文档 | `WORKBUDDY_HANDOFF.md`（9-28 更新），是本项目的**唯一可信说明** |
| 服务状态 | `http://127.0.0.1:5173/` 返回 200，服务正在运行 |
| Codex 约定文件 | 无 `AGENTS.md` |

**工作区是脏的**：14 个文件已修改（+767 / -99），另有 6 个未跟踪新文件。Codex 停在半成品状态，没有提交基线。

主要改动：`guided-tour.js`（+274）、`index.html`（+156）、`server.py`（+147）、`startup.js`（+101）、`library.js`（+73）、`app.js`（+49）。

## 2. 真实运行架构

```
python server.py  (1012 行，标准库 http.server)
   ├── 根目录 *.py   业务模块（arrangement_* / omr_normalize / pdf_geometry / performance_service 等）
   ├── dist/         手写前端源码（ES module，入口 index.html → app.js）
   ├── scripts/      check-*.cjs 回归脚本 + 若干 python 脚本
   └── tests/        8 个 py 测试 + 4 个 mjs 测试
```

入口链路：`dist/index.html`（181 行）→ `<script type="module" src="/app.js">` + `campus.js`，其余模块由 `app.js` 顶层 `import` 串联。服务端只打包 CSS（`BUNDLE_CSS` + `/bundle.css`），**JS 不打包**。

## 3. Codex 停在哪（WIP 判定）

从改动内容看，Codex 最后一轮在做 **「导师语音讲解 / 导览旁白」** 这条线：

- 新增音频资产：`dist/narration/`（`mentor-preface.m4a` 366KB、`tang-introduction.m4a` 430KB、`mentor-welcome.m4a` 48KB、`mentor-script.json`、`generation.json`）
- 新增服务端能力（`server.py` +147）：`/api/voice-reference`（含 `/mentor/`、`/self/` 子路径）、`/api/scores/<digest>/vocal`、`/api/scores/midi`、`gzip_cached`
- 新增前端模块：`dist/midi.js`、`dist/mentor-voice.js`、`dist/narration-opening.js`
- 新增数据文件：`dist/mentor-research.json`、`dist/mentor-visits.json`

**接线状态（已修正，见下方勘误）：**

| 模块 | 被谁引用 | 判定 |
|---|---|---|
| `midi.js` | `app.js` | 已接线 |
| `narration-opening.js` | `tour-presentation.js` ← `guided-tour.js` ← `workspace.js` | 已接线 |
| `mentor-voice.js` | `voice-record.js` | 已接线 |
| `voice-record.js` | `voice-record.html`（独立录音页） | 已接线 |
| `startup.js`（+101 行） | 无人引用 | **未接线 → 本轮已修复** |

语音线是**完整**的：独立录音页 `dist/voice-record.html` 是它的入口（本来就该独立，不挂在工作区上），
配套 `voice-record.css` / `voice-prompts.json` 齐全；`mentor-voice.js` 有分片上传、导师授权勾选、
试听与 CosyVoice 对照；服务端 `/api/voice-reference` 实测返回 403（路由活着、鉴权生效）。

### 勘误（本轮动手时发现上一版判断有误）

上一版说「`voice-record.js` 无人引用、语音线没有入口」是**错的**。原因：判断"谁是孤儿"时只
grep 了 `dist/*.js` 和 `dist/index.html`，**漏了其他 HTML**。而 `dist/` 下有 4 个页面
（`index.html`、`voice-record.html`、`worker.html`、`research.html`），模块完全可能由别的页面加载。
正确做法是扫全部 `dist/*.html`（见"通用手法"）。重新扫描后真孤儿只有两个：`mobile.js`
（交接文档明确要求不再启用）和 `startup.js`。

## 4. 风险清单

1. **`README.md` 是脚手架残留，不是本项目说明。** 内容是 `vinext-starter`（Cloudflare vinext + D1 + Drizzle 模板），与钢琴陪练系统毫无关系。**别照它操作**（照它跑 `npm run dev` / `npm run build` 会走到完全另一套东西上）。

2. **`dist/` 是手写源码，不是构建产物。** `.gitignore` 第 39 行有明确注释：`# dist contains the authored standalone web client and must be tracked.` 目录名叫 `dist` 是最大的陷阱 —— 任何「清理构建产物」的操作（`rm -rf dist`、`npm run build`）会毁掉全部前端源码。

3. **两套架构并存。** `app/`、`db/`、`drizzle/`、`worker/`、`components/`、`hooks/`、`lib/`、`next.config.ts`、`vite.config.ts`、`cloudflare-env.d.ts` 是 vinext 脚手架；真实服务是 Python。脚手架是否还要保留需确认，否则不要碰。

4. **`requirements.txt` 严重不完整**：只有 `PyMuPDF==1.27.2.3` 一行。实际 import 了 `PIL`、`bs4`、`bs_roformer`、`cosyvoice`、`faster_whisper`、`modelscope`、`oemer`、`numpy`、`imageio_ffmpeg` 等重型依赖。换机器或重装环境会直接趴，且重型模型文件大概率不在仓库里。

5. **`dist/research.html`、`research.js`、`research.css` 在磁盘上但被 gitignore**（第 58–60 行），丢失后无法从 git 恢复。

6. **没有提交基线**：14 个改动 + 6 个新文件全部悬空。改之前建议先 commit 一个 WIP 基线（只用 `git add` + `commit`，**绝不 `git reset --hard`**）。

7. **改 Python 必须重启服务才生效**（`server.py` 及其 import 的模块都是进程内模块）。只做语法检查不算验证。

8. 回归脚本 `scripts/check-*.cjs` 有 30+ 个，都会启动 msedge，**必须串行执行**，并行会互相抢服务误报失败。

## 5. 需要唐老师回答的

1. 导师语音 / 导览旁白这条线还要继续做吗？继续的话第一件事是把 `startup.js` 和 `voice-record.js` 接进入口。
2. `startup.js` 那 101 行改动，是没做完，还是有意先放着？
3. vinext 脚手架（`app/`、`db/`、`worker/` 等）是删掉还是留着？
4. 未提交的改动，我可以先 commit 一个 WIP 基线吗？

## 6. 我建议的动手顺序

1. 先回答上面 4 个问题，定下本轮目标；
2. commit WIP 基线（不 reset、不删文件）；
3. 按目标改代码；
4. 跑串行回归脚本 + 重启服务后实测接口；
5. 按日期追加回写 `WORKBUDDY_HANDOFF.md`。

## 7. 本轮已完成的改动（2026-10-02）

1. **`startup.js` 接进入口**（唯一的真孤儿）。`index.html` 里 122 行 / 4624 字符的内联副本
   换成 `<script src="/startup.js" onerror="...">`；内联版独有的那行 `tour-arrival`
   已并进 `startup.js`（`library.js`、`tour-presentation.css/js` 都在消费它，丢了会坏导览）。
2. **新增回归脚本** `scripts/check-startup-external.cjs`，三段全 PASS：
   - 正常：`/startup.js` 返回 200、执行后打上 `boot-ready`、遮罩移除、无 JS 报错；
   - **阳性对照**：把 `/startup.js` 拦成 404，断言此时**不会**出现 `boot-ready`
     （证明收尾确实由它负责），且兜底让主体可见、不把人卡在启动页；
   - `?tour=1`：`tour-arrival` 仍然挂上。
3. **踩到的坑**：HTML 内联事件处理器里写裸 `addEventListener(...)`，会绑到
   **`<script>` 元素自己身上**（内联 handler 的作用域链里元素优先于 document/window），
   而 `DOMContentLoaded` 只在 document 上触发 —— 结果兜底永远不执行。
   必须写 `document.addEventListener(...)`。

**既有失败（非本轮引入）**：`scripts/check-auto-tour.cjs` 失败。已做对照验证 ——
临时把 `index.html` 还原成 git 里的 HEAD 版本再跑，同样失败且失败得更早
（HEAD 版连 `.tour-home-intro.is-visible` 都没等到，本轮版本至少走到了子元素）。
即导览线本身还是 WIP，与本次改动无关。

**本轮没做**：未改任何 Python（本次是静态文件，不需要重启服务）。

## 8. 导览线：6 个脚本由红转绿（2026-10-02 第二轮）

`check-auto-tour` / `check-tour-home` / `check-presentation-tour` / `check-tour-header` /
`check-tour-selection` / `check-narration-opening` 原本全跑不过。**产品代码没坏，是脚本脱离了实现**
——本轮只改脚本，没动导览功能。三类过时原因：

1. **选择器不唯一**：`.tour-home-intro button` 现在匹配 **6 个**元素。开场页加了旁白播放列表
   （3 张卡片的"试听" + "连续播放全部" + "直接看演示" + 主按钮），Playwright strict mode 直接报错。
2. **按钮语义变了**：主按钮从「往下看看 ↓」变成「播放前言并开始演示」。点它会先播音频，
   **不滚动、不推进导览**；要进入导览必须点「直接看演示」（触发 `finish()` 让
   `openingNarration` 的 Promise 落地）。headless 下音频播不了，所以脚本一律走"直接看演示"。
3. **文案断言过时**：导览台词已改写为异地 MIDI 合奏 / ICMC 那条线，
   旧的 `/毫秒|时间码/`、`/虚拟合奏/` 都不再出现（现文是"网络合奏"）。

修完后全部 PASS（含 1440 / 390 / 844×390 多视口），`check-auto-tour.cjs` 已复跑一次确认不是偶发。

## 9. 抢修：整站打不开，进度条卡在 92%（2026-10-02 晚）

唐老师反馈"打不开了，卡在 92%"。定位与修复：

- **92% 是 `startup.js` 里 `creep` 的推进上限** —— 说明启动脚本在跑，但 `workspace-ready`
  没来。现场证据：`html` 停在 `booting`、工作区导航面板 0 个、`#startup` 不消失，
  pageerror 只有一条：**`Unexpected token 'catch'`**。
- **根因**：`dist/narration-opening.js` 第 20 行少写一个 `}`（05:02 的编辑把单语句 `if`
  改成 `{}` 块，结尾没同步补括号），`try` 没闭合 → `catch` 成孤立 token。
  因为它是 ES module，**一个文件语法错 = 整条 import 链静默失败**，`workspace.js`
  根本没执行 —— 表现不是报错弹窗，而是整页静默卡死。
- 修好后现场：`boot-ready`、遮罩移除、4 个工作区面板、0 报错。
- 补了 `scripts/check-frontend-syntax.cjs`（秒级扫 `dist/` 全部脚本语法，不启浏览器），
  并做了**阳性对照**：把错误放回 → 报出 `narration-opening.js:20`；恢复 → 34 个文件全 PASS。
- 顺带确认：`dist/narration/` 现在已有 `mentor-context.m4a` 与 `tour.json`
  （05:02 之后补齐的，早上那份快照里还没有），音频资产不缺。

**仍是既有失败（已用对照证明，非本轮引入）**：`scripts/check-full-engraved.cjs` 卡在
`#sample-button` 不可见。把 `index.html` + `startup.js` 还原到 Codex 基线 `ec712bd` 重跑，
同样失败在同一步。成因与交接文档 2026-09-28 记的那条一致：工作区改成多面板后，
示例谱按钮被搬进默认折叠区，未切面板/未展开时元素被裁剪。要修得让脚本先切到「曲库」面板。
