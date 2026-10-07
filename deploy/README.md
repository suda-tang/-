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

仓库包含运行代码和前端。`.sites-runtime` 中的模型权重、Python 虚拟环境、作品库、日志，以及个人音视频素材不直接提交到公开 Git。安装后 MIDI / MusicXML 和核心网页可运行；完整音视频转录、模型演奏、声音复刻需要对应模型运行环境。

现有模型安装入口：

- `scripts/install-performance-model.py`：下载 PianistTransformer 权重。
- `scripts/install-transcription.ps1`：音视频转录组件；需要先建立 `.sites-runtime/performance-env` 并安装兼容的 CPU PyTorch 2.7.1。
- `scripts/setup-omr.ps1`：Audiveris，已由 `setup --omr` 调用。

完整现有机器迁移时，停服后单独备份 `.sites-runtime` 的作品与模型目录，以及未公开的导师素材；在目标机器重建虚拟环境，不能复制 Windows Python 虚拟环境后假设可以运行。不要把备份包发布到公开仓库。语音与数字人模型需有已获授权的素材才能恢复。

`doctor` 检查本地部署环境和 HTTP 可用性，不会把缺少权重、账号登录或外网隧道误报成已完成。
