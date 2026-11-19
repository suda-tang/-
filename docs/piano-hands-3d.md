# 三维手型示范

入口：声音与播放设置 → 真实键盘图示 → 3D 手型示范。
开启手型时自动开启键盘。关闭键盘时同时关闭并销毁手型的 WebGL 上下文。

复用项目已部署的 MIT PianoPlayer 指法优化器（vendor/pianoplayer，scripts/piano-fingering.py），以及 MIT Three.js（dist/vendor/three/LICENSE）。
研究过 PianoPlayer 自带三维播放和 typing-ai 的关节驱动设计；没有复制后者代码或无明确授权的模型素材。
左右手现使用 immersive-web/webxr-input-profiles 的 MIT generic-hand 连续蒙皮网格，每只约 95 KB；资源本地部署于 dist/assets/piano-hands，授权与来源同目录保存。骨骼映射、固定骨长 IK、键位坐标与动画在 dist/piano-hands-3d.js 实现。

原谱/用户已保存的指法优先；缺少指法时通过已有 /api/fingering 队列后台计算并存入已有指法缓存，任务中心显示进度。
计算完成前采用键位布局预览，进度文字会明确显示计算状态，不把预览指序作为原谱指法。
动画直接使用播放器的拍位、持续音、静音和独奏状态；不播放第二份 MIDI，不修改速度、节奏或音高。

三维手型为示意模型，不是专业演奏动作捕捉；超出单手五指能力的音群不保证具有可执行的真实姿态。
渲染限约 30 帧、像素比最高 1.5；离开可视区、隐藏网页或关闭选项时停止绘制，暂停后短暂收敛再停止。

验证：scripts/check-piano-hands.cjs（移动/桌面渲染、显示开关、WebGL 释放；指法服务使用测试响应）；tests/test_fingering.py（实际 PianoPlayer 适配器）。

2026-10-14 动作修订：拇指掌骨固定于掌部，单独求解拇指近节/远节；其余手指采用弯曲平面内的关节约束解。PIP 目标范围 0–105°、DIP 0–85°，保持骨段长度。每只手独立预读下一组音符，非演奏手保留已有手位，闲置手指预备落键。范围是动画姿态约束，不是医学测量或个体演奏姿态的标准。
附加验证：scripts/check-hand-joint-limits.cjs 检查 12 组代表性可达姿态的骨长、落键误差和反折；不是对任意大跨度和弦/所有指序的完全证明。
