# -*- coding: utf-8 -*-
"""上游回答的通用文本清洗：页面驱动 / 直连**共用**。

为什么单独抽一个模块（2026-10-01）：
这段免责尾注的判据原本只写在 `suda_broker.py`（页面驱动）里，
broker 在轮询 DOM 时顺手剥掉了，所以页面模式一直是对的。
切到 WebSocket 直连之后，直连拿的是**上游原始文本**、根本不经过 broker，
尾注就原样漏给了用户 —— 实测长回答（324 字）末尾带着：

    以上来源AI自动生成，仅作参考！

**两个通道必须共用同一套判据**，否则修了一边、另一边继续漏。
所以把它抽到这里，谁都不许再各写一份。
"""

from __future__ import annotations

import re

# 页面/上游自带的免责尾注：只有长回答才会出现。
# 实测有「无括号」和「带全角括号」两种写法：
#   以上来源AI自动生成，仅作参考！
#   （以上来源AI自动生成，仅作参考！）
# 判定要点：必须出现「AI / 人工智能 / 大模型 / 模型 / 智能」+「生成|来源|整理」+「参考」。
# 靠这个 AI 关键词，才能和「以上是我生成的代码，请参考…」这类正常句子区分开。
FOOTER_PATTERNS = (
    re.compile(
        r"^[\s（(【\[「『]*"
        r"(?:以上|本)[^\n]{0,20}?"
        r"(?:AI|ai|人工智能|大模型|模型|智能)"
        r"[^\n]{0,20}?(?:生成|来源|整理)"
        r"[^\n]{0,20}?参考"
        r"[^\n]{0,16}?[）)】\]」』！!。.]{0,3}\s*$"
    ),
)
FOOTER_MAX_LEN = 45

# 尾注可能被 markdown 记号包着。实测（2026-10-01 阳性对照抓到）上游会发：
#   以上来源AI自动生成，仅作参考！        ← 裸文本
#   **以上来源AI自动生成，仅作参考！**    ← 加粗包裹 ← 第一版正则不认星号，直接漏给用户
# 页面驱动模式看不出来：DOM 里 `**…**` 已经被渲染成 <strong>，读到的是纯文本。
# 直连拿的是原始 markdown，所以必须自己把强调/引用/列表记号剥掉再判。
_LEAD_NOISE = re.compile(r"^[\s>*+\-·#`_]+")
_TRAIL_NOISE = re.compile(r"[\s>*+\-·#`_]+$")


def _normalize(line: str) -> str:
    """去掉行首行尾的 markdown 噪声（强调、引用、列表记号、空白）。"""
    text = _LEAD_NOISE.sub("", str(line or ""))
    return _TRAIL_NOISE.sub("", text).strip()


def is_footer_line(line: str) -> bool:
    """整行都是免责尾注。长度设上限，避免误删正文里正常出现该句式的长句。"""
    text = _normalize(line)
    if not text or len(text) > FOOTER_MAX_LEN:
        return False
    return any(pattern.match(text) for pattern in FOOTER_PATTERNS)


def strip_footer(text: str) -> str:
    """从**尾部**剥掉免责尾注（连同它前面的空行）。

    只从尾部剥：正文中间出现同句式的行是合法的，不能误删。

    ⚠️ 末尾只能用 `rstrip()`，**不能用 `strip()`**。实测踩到（2026-10-01）：
    流式尾部守卫会把文本切成「已发 + 压住的尾巴」两段，压住的尾巴**可能恰好以
    换行符开头**；这时 `strip()` 会把这个换行也吃掉 → 客户端收到的正文里
    少了一个换行。症状很隐蔽：文本看着没错，只有逐字比对才发现。
    """
    lines = str(text or "").splitlines()
    while lines:
        tail = lines[-1].strip()
        if not tail or is_footer_line(tail):
            lines.pop()
            continue
        break
    return "\n".join(lines).rstrip()
