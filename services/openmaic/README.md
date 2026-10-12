# 曲谱课堂

采用 THU-MAIC/OpenMAIC 官方 `@openmaic/generation@0.3.18`，原生接入本项目播放器和云曲库。上游 https://github.com/THU-MAIC/OpenMAIC ，MIT 授权见 OPENMAIC-LICENSE。

安装：`pnpm install --dir services/openmaic --frozen-lockfile`。随原 Python 服务启动，入口为演奏、跟弹练习下方的曲谱课堂。

## 教学与展示

支持全曲或指定小节、20/35/40/45/90 分钟。高中音乐课堂围绕聆听、讨论、音乐要素和合作创作；钢琴教学为独立场景，明确的高中课堂要求优先。长作品上下文按全曲抽样，不能据此断言完整曲式。

使用上游生成器的 PPT、测验、HTML 互动活动、PBL 小组项目与教师讲解动作。PPT 保留元素位置，支持全屏展示和可编辑 pptx 导出。课件标注与讲解逐项执行，讨论时停下。支持多选题、开放题反馈与连续教师问答，小组活动记录保存在当前设备。互动页面运行于隔离 iframe，禁止网络请求与访问主页面。

后台生成按环节保存；模型连接中断最多重试两次，重新生成复用已有环节。课程、课件和导出文件缓存在 `.sites-runtime/classrooms`；任务中心展示作品和阶段。首次生成时间由模型与课程复杂度决定。

## 配置与边界

模型环境变量 CLASSROOM_MODEL_URL、CLASSROOM_MODEL_KEY、CLASSROOM_MODEL，默认使用本机 8765 网关；密钥不下发客户端。语音使用独立导览男声服务，不更改导师预合成语音。

这是官方 SDK 的原生适配，并非 OpenMAIC 全站部署。未包含上游多人实时协作、完整虚拟学生自治系统或任意外部工具执行。PPT 导出支持文字和基础图形，复杂图表与远程图片未必完全复原。教学判断仍需教师核查，不能将生成内容当作已验证史实或真实学生表现。

## 课堂执行与材料（2026-10-12）

本机 DSL 0.11.3 定义 21 种原生动作，而不是 28 种。现在使用统一执行器 `dist/classroom-engine.js`，另加 11 种音乐/页面动作，共 32 种。包括白板文字、图形、八类 SVG 图表、表格、本地 KaTeX 公式、代码及行编辑、媒体播放、讨论、互动页面高亮/状态/批注/揭示，以及小节聆听、定位、暂停、停止、速度、声部独奏、恢复混音、音量、谱面视图、上传素材播放和课堂跳页。

实时问答输出 reply 与动作数组；文字流式展示，执行后将真实结果回传模型，最多三轮，避免无限操作。范围、速度、动作数量在服务端校验，播放器再次校验真实声部。切换作品停止旧课堂操作。互动 iframe 使用随机通道并校验 source，不向活动开放主页面 DOM、网络或任意脚本执行。活动可调用 `window.maic.report({kind:'submission',value:实际答案})`，或在 `script[data-maic-observation]` 存放 JSON；`maic-state` 事件提供教师设置的状态。通用点击和表单变化也会回传。提交反馈、测验和小组记录按浏览器课堂会话保存到服务端，模型据真实记录安排重听、对比或追问；这不是已验证的学习成效评估。

课程设置内“教材与课堂材料”可联合选择 PDF、DOCX、文本、照片及音视频，最大每份 200 MB。分片上传可续传、哈希去重，后台解析有进度并进入任务中心。PDF 无文字页使用本地 OCR；音视频转换 MP3，并用已缓存的 faster-whisper base 在 CPU 上转录。没有讲述文字的音乐仍可作为聆听素材，转录失败显示原因且可以重试；不会伪装成已理解音频内容。不自动下载 ASR 模型。材料随作品保存；选中的材料进入课程缓存签名，生成与问答共享材料，长材料有截断标记。原件与转换文件在 `.sites-runtime/classroom-materials`。

“修改当前课件”提供文字区域与讲稿局部编辑、按要求修改预览、保存及修订检查。修改讲稿使旧音频失效，保留最近 20 个修订快照。不会重新生成整堂课。当前没有可视化拖拽排版、多用户编辑冲突合并或跨设备学习者身份认证。

验证：`python -m unittest tests.test_classroom_runtime tests.test_score_classroom`；`node scripts/check-classroom-engine.cjs`（电脑/手机、模拟模型动作和播放器回执、真实 iframe 与 DOM）；`python scripts/check-classroom-materials-http.py`（真实 HTTP 上传、PDF/DOCX/文本、本机音频转换与 CPU ASR 路径、Range 播放）。纯音测试不用于评价语音转录准确度。原有聆听、PPT 放映与项目教练浏览器回归另见 `scripts/check-classroom-*.cjs`。
