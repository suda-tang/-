# 苏州大学钢琴演奏教学辅助系统

唐秋鸣课题设计实例。网页客户端、Python 服务端以及苏大 DS / WebVPN 接口均在本仓库。

Windows 本地部署请看 [部署指南](deploy/README.md)。现有独立客户端直接从 `dist` 提供，不需要运行模板项目的 `npm run dev`。

```powershell
py -3.12 deploy/manage.py setup --omr
py -3.12 deploy/manage.py start
py -3.12 deploy/manage.py doctor
```

浏览器打开 http://127.0.0.1:5173/ 。以后可双击 `start-local.cmd`。

苏大账号、WebVPN 登录态、上传作品库和训练素材不在公开仓库中。可公开的大型模型和运行资源保存在本仓库 Releases，可按部署指南一键下载校验并恢复；私人训练素材及身份数据除外。

完整公开资源恢复：

```powershell
py -3.12 deploy/restore_runtime.py --group all
py -3.12 deploy/setup_models.py --group all
```

大型模型依赖还需 Python 3.10，详见部署指南。
