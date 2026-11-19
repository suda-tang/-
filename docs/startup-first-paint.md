# 首帧加载页

加载页布局、动画、校徽均随 index.html 内联提供。校徽为同一苏大校徽的 120px WebP（显示尺寸60px），其余校徽资源保留原分辨率。
Head 不包含同步外部脚本或阻塞渲染的样式表。真实键盘和滚轮样式已加入 server.py 的 BUNDLE_CSS，不再独立阻塞首绘。
window.startupFirstPaint 在两次 requestAnimationFrame 后兑现，应用入口、语言模块、校园模块、AI模块和 modulepreload 均在此后执行。现有启动进度、完成后立即退出加载页的逻辑保留。
HTML 尚未从服务器到达之前不能绘制加载页，本次优化不代表 DNS/TLS/FRP 首字节延迟已消除。

验证：scripts/check-startup-first-paint.cjs 将所有外部脚本和样式人为延迟1800ms；加载页及校徽仍先绘制，桌面/手机之后正常启动工作区。


## 2026-10-14 首屏依赖调度

普通入口在首帧后预取 app/workspace 的静态依赖图，避免 FRP 高延迟网络逐层请求。AI、语言和校园装饰在 workspace-ready 后下一帧启动；导览入口保留数字人优先。清单只包含静态依赖，不预取 PDF、3D 手型及课堂等动态模块。修改静态 import 后运行 `python scripts/build-startup-preloads.py`。预取清单失败不阻断常规模块加载。

本地 Edge 冷启动、模拟 120 ms 延迟和 750 KB/s 下载：工作区就绪从 3346 ms 降至 2375 ms，首屏就绪前资源数从 94 降至 74。单轮对照，非真实公网或 iPhone 的性能保证。复测：`node scripts/measure-startup-network.cjs`。
