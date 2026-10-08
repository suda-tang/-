# 本地部署

需要 Windows 10/11、Python 3.12、联网权限。安装时保持网络可用；首次 Audiveris 下载较大。

## 安装与启动

在项目根目录运行：

```powershell
py -3.12 deploy/manage.py setup --omr
py -3.12 deploy/manage.py start
py -3.12 deploy/manage.py doctor
```

安装器创建项目内独立 Python 环境，安装网页后端、OCR、音乐处理、苏大 DS 和 Playwright Chromium；`--omr` 下载并校验 Audiveris。启动器同时启动 5173 网页服务及 8765 DS 服务。遇到已占用端口不会结束现有程序。日志位于 `.sites-runtime/deployment/`。服务启动不等于学校身份认证成功；需在弹出的浏览器中登录并用 AI 对话验证。

部署参数：复制 `deploy/local.example` 为 `deploy/local.json` 后修改。该文件不会提交。`SUDA_DEEPSEEK_BROWSER_CHANNEL` 默认 `msedge`，也可留空使用安装的 Chromium。不要将 DS 的 8765 端口直接公开到互联网。

## 苏大 DS 与 WebVPN

完整接口、浏览器认证、WebVPN 登录及续期源码在 `services/suda-ds/`。校园网可直接使用默认配置；校外使用 WebVPN 配置示例。VPN 登录需要本人有权限的苏大账号。可以在浏览器手动登录，不要求将密码写入代码。

登录通道变化时可执行：

```powershell
.sites-runtime/deployment/env/Scripts/python.exe services/suda-ds/refresh_wvpn.py
```

此命令会重启本机 8765/8766 服务，需安排在没有正在进行的 AI 任务时运行。需要持续监测 WebVPN 时，在独立终端运行 `wvpn_guard.py`；它会在通道失效时恢复登录。登录态保存在该服务目录的隐藏文件和浏览器配置中，已加入忽略规则。迁移机器后重新登录，不共享会话。

这里的 VPN 指学校 WebVPN。FRP 属于外网访问隧道，需要用户自己的服务器地址和认证配置，不是学校身份认证的一部分。

## 大型模型与本机作品库

仓库包含运行代码和前端。可公开的原版模型、开源运行组件、通用导览音频及背景音乐保存在 GitHub Releases，避免大型权重进入 Git 历史。账号会话、访问密钥和申请材料不公开。个人曲谱、原始素材、训练及身份资产已获用户明确授权，见本文末尾的独立个人项目数据包。

现有模型安装入口：

- `scripts/install-performance-model.py`：下载 PianistTransformer 权重。
- `scripts/install-transcription.ps1`：音视频转录组件；需要先建立 `.sites-runtime/performance-env` 并安装兼容的 CPU PyTorch 2.7.1。
- `scripts/setup-omr.ps1`：Audiveris，已由 `setup --omr` 调用。

完整现有机器迁移时，停服后单独备份 `.sites-runtime` 的作品与模型目录，以及未公开的导师素材；在目标机器重建虚拟环境，不能复制 Windows Python 虚拟环境后假设可以运行。不要把备份包发布到公开仓库。语音与数字人模型需有已获授权的素材才能恢复。

`doctor` 检查本地部署环境和 HTTP 可用性，不会把缺少权重、账号登录或外网隧道误报成已完成。

## 恢复公开模型与资源

先安装核心环境，再运行：

```powershell
py -3.12 deploy/restore_runtime.py --group all
```

仅需识谱、配器、演奏、音轨分离与通用展示资源时，可选 `--group core`；仅恢复 CosyVoice 原版模型与源码时选 `--group cosy`。下载来自本仓库 Releases，逐包显示进度并校验 SHA-256。每个包的文件数量、大小、下载地址和校验值见 `deploy/runtime-core-manifest.json`、`deploy/runtime-cosy-manifest.json`；完整路径清单在相应 Release 的 `runtime-inventory.json` 中。

网络需要代理时可加 `--proxy http://127.0.0.1:7897`（改成自己的代理）。程序不会读取或上传本机账号。

模型依赖环境需在目标电脑重建：性能模型使用 Python 3.12，头像与 CosyVoice 使用 Python 3.10。安装两个 Python 版本后运行：

```powershell
py -3.12 deploy/setup_models.py --group all
```

也可分别选择 `performance`、`avatar`、`cosy`。此命令按本机已导出的依赖版本安装，CPU PyTorch 从官方源取得。第三方模型保留原有许可证，使用时遵守各组件授权。公开资源上传及恢复工具已测试；尚未在全新电脑上逐项验证全部大型模型推理。

CosyVoice 恢复到项目内 `.sites-runtime/cosyvoice`，相关脚本优先使用该目录；也可通过 `PIANO_COSY_RUNTIME` 指定其他位置。已有电脑仍兼容 `C:/PianoCoachRuntime/cosyvoice`。原版模型不包含导师音色：复刻声音仍需要用户另行提供已授权的素材。

不复制虚拟环境、`node_modules`、字节码、日志、下载残片、重复压缩包和第三方 Git 历史；这些是可重建或重复的内容。依赖锁、原版模型、运行源代码及恢复工具均公开。

## 用户授权的个人项目数据

用户已明确授权将个人曲谱、原始音视频、音色训练集与权重、照片及面部身份数据上传到公开仓库的独立 Release。此数据包与通用开源模型分开，默认 `--group all` 仅恢复通用资源。

需要恢复这些已授权数据时，明确运行：

```powershell
py -3.12 deploy/restore_runtime.py --group personal
```

清单为 `deploy/runtime-personal-manifest.json`。大型训练检查点分片下载后会自动合并，并再次校验完整文件 SHA-256。恢复会写入对应的曲谱和训练目录，应在没有识谱、训练或作品修改任务运行时进行；相同路径的文件会被恢复版本替换。

学校账号、密码、访问密钥、Cookie、浏览器登录态仍不公开；恢复数据后需重新设置本机上传密码并完成学校登录。访客专属问候语音和博士申请材料不在这次授权数据包内。
