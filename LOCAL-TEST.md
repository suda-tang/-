# 内网测试

页面左侧“已上传琴谱”从服务端读取历史记录，关闭网页或重启服务后仍保留。新上传的 PDF 原件及文件名保存在 `.sites-runtime/score-cache`，可从列表直接恢复原谱与识别结果；旧缓存没有原件时仍可打开电子谱。文字中的替换字符、控制字符和私用区乱码在显示时清理，原件不改写。

启动：在项目目录执行 `python server.py`。服务监听 5173 端口。

目前测试地址为 http://192.168.2.6:5173/ ，地址随 WLAN 分配可能变化。

## 自动演奏

可以使用内置示例或导入 MusicXML / MXL。支持合成钢琴音色、和弦、休止、延音线、暂停继续，以及 30–240 BPM 实时调速。勾选“音符识别完成后自动播放”后会尝试自动开始；浏览器要求用户操作时，点击“自动演奏”解锁声音。

示范播放与麦克风评分互斥，示范数据不进入评分。按书写顺序演奏，暂不展开反复与跳房，不还原踏板、表情和装饰音。

## PDF 识谱依赖

普通 PDF 自动转换音符依赖 Audiveris。当前工作机已配置 Audiveris 5.11.0，服务启动后会自动发现项目目录 `.sites-runtime/omr/extracted` 中的引擎；上传后会先预览 PDF，再识别 MusicXML，并按“自动演奏”开关尝试播放。长谱识别最多等待 15 分钟，建议按单首曲目拆分。

上传后页面会显示 PDF 渲染、音符识别、OCR 和电子谱排版的进度。OCR 会读取第一页上方的曲名、作曲/编曲等字段，并同步到电子谱标题和说明；识别不到时会保留 PDF 或文件名信息，不会阻塞音符识别。识别结果按 PDF 内容哈希缓存：浏览器的 IndexedDB 和服务端 `.sites-runtime/score-cache` 都会复用已完成的 MusicXML，关闭网页后再次导入同一文件无需重新识谱。

首次配置或换电脑时运行：

```powershell
powershell -File scripts/setup-omr.ps1
```

脚本使用官方发行包的分片下载并校验 SHA-256，网络中断后可重复运行继续下载。

也可从 [Audiveris 官方发行页](https://github.com/Audiveris/audiveris/releases/tag/5.11.0) 下载 Windows Console MSI，然后执行：

```powershell
powershell -File scripts/setup-omr.ps1 -Installer "C:\path\Audiveris-5.11.0-windowsConsole-x86_64.msi"
```

脚本将程序解压到项目的 `.sites-runtime/omr/extracted`，服务会自动发现。返回网页重新打开或点击“重新识谱”。也支持已安装在 `C:\Program Files\Audiveris` 的程序，或用 `AUDIVERIS_PATH` 指定可执行文件。

网络上的 HTTP 页面可以播放合成声音，但浏览器通常只在 HTTPS 或本机 localhost 页面开放麦克风；需要麦克风时请在服务器电脑打开 http://localhost:5173/ 。

## 验证

`node --test tests/engine.test.mjs`：跟谱评分单元测试。

`node scripts/check-playback.cjs`：当前工作机 Edge 浏览器测试，覆盖内网 PDF 预览与错误、MusicXML 自动播放、暂停继续、调速、延音/休止解析、实际非零音频输出与窄屏布局；识谱接口在该脚本中使用模拟响应以保持测试快速。

`node scripts/check-omr-real.cjs`：使用 `outputs/Dichterliebe01.pdf`（Audiveris 官方示例）做真实端到端识谱，确认浏览器最终得到可播放音符。

## AI 工作区（需本地 5173 已在跑，且曲库里有 ready 的曲谱）

这三个用**桩响应**驱动，不依赖模型发挥，也不产生副作用：

`node scripts/check-ai-action-guard.cjs`：动作执行守护 —— 空转必须报警、已在目标面板不误报、
面板中文别名归一、未知动作不静默、「只答应不给动作」有提示、空关键词搜索先问清楚。
（★ 开头会先打开一首 ready 曲谱：空转反例用的是「把已经静音的声部再静音一次」，
没有载入曲谱时 `#part-mix` 是空的，用例会直接失效。）

`node scripts/check-ai-control-actions.cjs`：控件类动作 —— 说「暂停」绝不能变成开始播放、
`pause`/`stop` 真的改变播放状态、变速/节拍器/音色/配器四个动作落到控件上、
视图四值（简谱/五线谱/原稿/音轨）都要真的切过去、无效取值必须报错、「全部静音」能关掉所有声部。

`node scripts/check-ai-library-visibility.cjs`：钉住发给模型的上下文载荷 ——
曲名索引（含总数）必须在、必须是上下文第一个键、完整 64 位 id 必须覆盖全部曲目、
整体不得超过包装层 20000 字符的 system 预算。

`node scripts/check-frontend-syntax.cjs`：前端脚本语法（67 个文件），改动前端后先跑这个。

端点级直测（curl 即可，不经过模型）：
- `curl -X DELETE 'http://127.0.0.1:5173/api/ai-tasks?id=不存在的id'` → 404 且回执里带这个 id
- 未知请求类型 → 回「未知的请求类型：bogus」；skills 空 query → 回「请先说明想要什么能力…」

真实模型（会真的调用 8765，较慢）的探针放在 `D:\code\2026-10-02-01-58-59\`：
`probe_context_budget.py`（上下文排布对比）、`probe_open_whitelist.py`（scores 空否对 open 的影响）、
`probe_new_actions.py`（暂停/变速/节拍器/音色/配器/越界小节）、`e2e-real-ai.cjs`（端到端）。
