# 浏览器诊断

从原运行目录整理的浏览器回归检查。需要 Node.js、Playwright 和可用的 Microsoft Edge；从项目根目录运行，例如：

```powershell
node tests/browser/check-ai-controls.cjs
```

默认 `require('playwright')`；已有其他安装位置可设置 `PIANO_PLAYWRIGHT_MODULE`。测试生成的截图与日志仍留在 `.sites-runtime`，不提交。部分压力检查依赖本机云曲库和测试作品，未附带用户曲谱，不保证空曲库下全部可运行。手机模拟测试不等于真实 iOS Safari 测试。
