# 浏览器诊断

从原运行目录整理的浏览器回归检查。需要 Node.js、Playwright 和可用的 Microsoft Edge；从项目根目录运行，例如：

```powershell
node tests/browser/check-ai-controls.cjs
```

**排版性能与结构回归**：`node tests/browser/check-engraving-performance.cjs`
（会打开一首大曲，校验「只渲染首块 + 占位高度与真实高度吻合 + 音符注解齐全」这些不变量，
以及宽松的耗时上限；打印出打开耗时与最长长任务供人工对比趋势。可用
`PIANO_OPEN_LIMIT_MS` / `PIANO_LONG_LIMIT_MS` 调整上限。）

默认 `require('playwright')`；已有其他安装位置可设置 `PIANO_PLAYWRIGHT_MODULE`。测试生成的截图与日志仍留在 `.sites-runtime`，不提交。部分压力检查依赖本机云曲库和测试作品，未附带用户曲谱，不保证空曲库下全部可运行。手机模拟测试不等于真实 iOS Safari 测试。
