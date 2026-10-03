# 导师数字人

用户已在本对话明确确认冒小瑛教授同意使用肖像制作数字人并用于项目展示。

照片调研：海伦钢琴官网“2023（第六届）音才奖 MTPC 海伦国际钢琴艺术节”中的冒小瑛大师公开课：
https://www.hailunpiano.com/html/2023/activities_0901/1137.html
对应图片：20230901015842181.jpg、20230901015858161.jpg。人脸分辨率不足，不使用低清合影生成，也不猜测未标注合影中的人物身份。

生成输入改用此前上传、标为 mentor 的 f922ad0fa273a637876ad1b4d9ddbef3.mp4 第 12 秒近景帧。素材保留在 .sites-runtime 内，不放入公开站点。网页仅发布通过解码、时长校验的合成视频，并标注为经授权的合成影像。

SadTalker 来源：https://github.com/OpenTalker/SadTalker
运行环境：.sites-runtime/avatar-env，模型：.sites-runtime/SadTalker。与 CosyVoice、识谱环境隔离。

先运行 scripts/setup-avatar-models.py 下载官方模型，再用 avatar-env 的 Python 运行 scripts/render-mentor-avatar.py --seconds 5 做预览。检查画面后，使用 --full --chapter mentor-preface（或 mentor-context / mentor-material）生成整段。

dist/narration/avatar-manifest.json 只记录解码、时长验证通过的结果。preview 不能当作完整章节播放。完整视频由现有音频播放器提供统一时钟，视频静音；暂停、拖动、倍速、切换章节和退出均同步。没有完整数字人视频时保留音频原流程。

目前采用 3D 感知的人脸动画视频，不是可自由旋转、可下载的全身 3D 网格。CPU 逐帧渲染较慢，不能宣称实时生成。模型渲染结果须人工检查后再视为可交付。
