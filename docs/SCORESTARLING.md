# ScoreStarling 链接转谱

入口：`/scorestarling.html`，或在 AI 联网找谱结果中点击“连接 ScoreStarling”。
账号连接由服务器统一保存，电脑连接一次后，手机、平板自动复用，并统一刷新授权。
旧版浏览器保存的连接会自动迁移，不需要再登录。OAuth 授权过程仍使用各浏览器独立
的 PKCE、state 和 HttpOnly Cookie，任务按浏览器隔离，凭据不会下发到客户端。
服务端凭据保存在 `.sites-runtime/scorestarling-private/`，不应上传或公开。
可选环境变量 `SCORESTARLING_PROXY` 指定服务端 HTTPS 代理。
若未配置代理环境变量且本机 7897 端口可用，会复用该本地代理；设为空字符串可禁用自动检测。

本地曲库检索沿用原有逻辑；确认联网后，已连接账号将搜索钢琴演奏链接，
多个版本列出供选择，唯一候选提交 ScoreStarling。也可直接在连接页面粘贴链接。
后台跟踪转录进度，任务中心记录阶段、结果和失败原因。
MusicXML 导出若被锁定，显示服务返回的积分费用，用户确认后解锁。
不自动购买积分，不使用付费乐队转录。导入保留 MusicXML 的全部声部。

服务当前需要 ScoreStarling 账号。未经真实账号授权，无法验证工具发现、转录和导出的真实结果。
服务声明 MusicXML 导出可能需要 15 积分，实际以接口返回费用为准。
参考：https://scorestarling.com/mcp

验证：`python -m unittest tests.test_scorestarling`。
单元测试覆盖授权隔离、状态校验、参数适配、积分锁定、总谱入库。
真实账号验收：连接账号 → 提交演奏链接 → 任务中心观察进度 → 确认实际导出费用（如有）
→ 云曲库出现作品 → 打开电子谱并试听。远端返回结果不代表识谱准确，仍需核对。
