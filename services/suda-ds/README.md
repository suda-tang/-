# 苏大 DS 与 WebVPN

运行代码及可公开的回归测试。统一安装、启动、学校登录和校外通道配置见项目的 `deploy/README.md`。账号、Cookie、浏览器配置、请求原文日志及含私人会话的测试样本不包含在这里。

模块：`launcher.py` 启动与守护；`suda_api.py` 提供兼容接口；`suda_broker.py` 管理浏览器认证；`wvpn_login.py`、`wvpn_guard.py`、`refresh_wvpn.py` 负责 WebVPN；`check-model.py` 与 `refresh-models.py` 提供模型诊断。

Windows 运行测试时请启用 UTF-8：

```powershell
$env:PYTHONUTF8 = '1'
python services/suda-ds/test_default_mode.py
python services/suda-ds/test_new_conversation.py
python services/suda-ds/test_ws_transient_retry.py
```

部分诊断依赖本机服务或私有请求样本，不应将那些样本上传来补齐测试。服务可用与学校授权就绪是两项不同检查。
