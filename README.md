# 苏州大学钢琴演奏教学辅助系统

唐秋鸣课题设计实例。网页客户端、Python 服务端以及苏大 DS / WebVPN 接口均在本仓库。

Windows 本地部署请看 [部署指南](deploy/README.md)。现有独立客户端直接从 `dist` 提供，不需要运行模板项目的 `npm run dev`。

```powershell
py -3.12 deploy/manage.py setup --omr
py -3.12 deploy/manage.py start
py -3.12 deploy/manage.py doctor
```

浏览器打开 http://127.0.0.1:5173/ 。以后可双击 `start-local.cmd`。

苏大账号、WebVPN 登录态、上传作品库和训练素材不在公开仓库中。大型识别、演奏和语音模型按部署指南另外安装。
