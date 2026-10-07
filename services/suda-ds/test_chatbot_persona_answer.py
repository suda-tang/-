# -*- coding: utf-8 -*-
"""回归测试：模型**崩回上游「苏州大学AI智能助手」人格**并「交作业」时必须被拦住。

## 现场（2026-10-03，三次都让客户端报 `Error Code: 10000 模型没有给出有效动作`）

```
「您好！我是苏州大学AI智能助手。根据您查询的"AI音乐方向博士招生"信息，我已在互联网上检索。」   ← 21:5x / 22:0x
「您好！我是苏州大学AI智能助手，很高兴为您服务。关于"挖导师"的任务…」                        ← 20:52:31
「您好！根据搜索结果，目前关于…以下是一些可能涉及该方向的国内高校及导师线索，供您参考：」      ← 22:0x
```

共同特征：**开头是聊天机器人的问候语**，正文**声称自己做过某个动作**，
而这一轮**一个工具都没发出去** —— 内容多半是凭记忆编的。

## 为什么原有判据拦不住

* `_FABRICATED_RESULT_MARKERS` **只在 `has_results=False` 时才检查** ——
  而这几轮前面已经有过工具结果（哪怕内容是别的题目）→ 直接漏过；
* `sounds_unfinished` 抓的是「说下一步 / 说做不到」，而它说的是「**我已经做完了**」，
  方向正好相反。

## 本测试钉住什么

1. 三个现场原文都必须命中；
2. **纯问候不许命中**（「您好！有什么可以帮您？」）—— 否则问候轮会被逼去乱调工具；
3. 不打招呼、直接说「我已检索」不许命中（那是别的判据的活，避免判据互相抢）；
4. 正常的任务答复不许命中。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import suda_api  # noqa: E402

PASS = 0
FAIL = 0


def ok(msg: str) -> None:
    global PASS
    PASS += 1
    print(f"PASS  {msg}")


def bad(msg: str) -> None:
    global FAIL
    FAIL += 1
    print(f"FAIL  {msg}")


def main() -> int:
    fn = suda_api.chatbot_persona_answer

    # ── [1] 现场原文必须命中 ────────────────────────────────────────────
    print("[1] 现场原文必须命中")
    field = [
        ('\u60a8\u597d\uff01\u6211\u662f\u82cf\u5dde\u5927\u5b66AI\u667a\u80fd\u52a9\u624b\u3002'
         '\u6839\u636e\u60a8\u67e5\u8be2\u7684\u201cAI\u97f3\u4e50\u65b9\u5411\u535a\u58eb\u62db\u751f\u201d\u4fe1\u606f\uff0c'
         '\u6211\u5df2\u5728\u4e92\u8054\u7f51\u4e0a\u68c0\u7d22\u3002',
         "★ 现场 1（AI音乐 + 我已检索）"),
        ('\u60a8\u597d\uff01\u6211\u662f\u82cf\u5dde\u5927\u5b66AI\u667a\u80fd\u52a9\u624b\uff0c'
         '\u5f88\u9ad8\u5174\u4e3a\u60a8\u670d\u52a1\u3002\u5173\u4e8e\u201c\u6316\u5bfc\u5e08\u201d\u7684\u4efb\u52a1\uff0c'
         '\u8bf7\u60a8\u544a\u8bc9\u6211\u60a8\u5177\u4f53\u60f3\u4e86\u89e3\u4ec0\u4e48\u3002',
         "★ 现场 2（挖导师 + 很高兴为您服务）"),
        ('\u60a8\u597d\uff01\u6839\u636e\u641c\u7d22\u7ed3\u679c\uff0c\u76ee\u524d\u5173\u4e8e\u201cAI\u97f3\u4e50'
         '\u65b9\u5411\u535a\u58eb\u62db\u751f\u201d\u7684\u516c\u5f00\u4fe1\u606f\u8f83\u4e3a\u96f6\u6563\uff0c'
         '\u4ee5\u4e0b\u662f\u4e00\u4e9b\u53ef\u80fd\u6d89\u53ca\u8be5\u65b9\u5411\u7684\u56fd\u5185\u9ad8\u6821\u53ca\u5bfc\u5e08\u7ebf\u7d22\uff0c'
         '\u4f9b\u60a8\u53c2\u8003\uff1a',
         "★ 现场 3（您好 + 根据搜索结果）"),
    ]
    for text, note in field:
        if fn(text):
            ok(f"命中：{note}")
        else:
            bad(f"漏判：{note}")

    # ── [2] 纯问候不许命中 ──────────────────────────────────────────────
    print("\n[2] 纯问候不许命中")
    for text, note in (
        ("\u60a8\u597d\uff01\u6709\u4ec0\u4e48\u53ef\u4ee5\u5e2e\u60a8\uff1f", "纯问候"),
        ("\u4f60\u597d\uff0c\u8bf7\u95ee\u9700\u8981\u6211\u505a\u4ec0\u4e48\uff1f", "「你好」+ 询问"),
        ("\u60a8\u597d", "只有「您好」"),
    ):
        if not fn(text):
            ok(f"未命中：{note}")
        else:
            bad(f"误判成出戏：{note}")

    # ── [3] 不打招呼、直接声称做过 → 不归本条管 ─────────────────────────
    print("\n[3] 不打招呼的直接声称不归本条管（避免判据互抢）")
    if not fn("\u6211\u5df2\u7ecf\u68c0\u7d22\u5b8c\u6bd5\uff0c\u7ed3\u679c\u5982\u4e0b\u3002"):
        ok("未命中：不打招呼的「我已经检索完毕」")
    else:
        bad("误命中：不打招呼的声称（应由别的判据处理）")

    # ── [4] 正常任务答复不许命中 ────────────────────────────────────────
    print("\n[4] 正常任务答复不许命中")
    for text, note in (
        ("\u6587\u4ef6\u5df2\u5199\u5165\u6210\u529f\uff0c\u5185\u5bb9\u4e3a\uff1aCONC-2-OK", "工具执行后的回执"),
        ("lines=3 sum=21", "统计结果"),
        ('{"tool_call":{"name":"Read","arguments":{"file_path":"C:/a.txt"}}}', "工具调用 JSON"),
    ):
        if not fn(text):
            ok(f"未命中：{note}")
        else:
            bad(f"误判：{note}")

    # ── [5] ★ 以「您好」开头但**正常收尾**的答复不许命中 ────────────────
    #    这是本次改动（新增 `_CHATBOT_ASK_BACK_MARKERS`）真正的风险点：
    #    「问候语 + 把活推回给用户」要判出戏，但**做完之后的礼貌收尾**不能误伤，
    #    否则任务干完了还会被 strict 重试逼着多调一次工具。
    print("\n[5] 问候开头 + 正常收尾不许命中（本次改动的风险点）")
    for text, note in (
        ("\u60a8\u597d\uff01\u4efb\u52a1\u5df2\u5b8c\u6210\u3002\u9ebb\u70e6\u60a8\u786e\u8ba4\u4e00\u4e0b\u7ed3\u679c\u3002",
         "问候 + 「麻烦您确认」（做完后的收尾）"),
        ("\u60a8\u597d\uff01\u6587\u4ef6\u5df2\u5199\u5165\u6210\u529f\uff0c\u5185\u5bb9\u4e3a\uff1aCONC-2-OK\u3002",
         "问候 + 工具回执"),
        ("\u60a8\u597d\uff01\u7edf\u8ba1\u7ed3\u679c\u5982\u4e0b\uff1alines=3 sum=21\u3002",
         "问候 + 统计结果"),
        ("\u60a8\u597d\uff01\u8bf7\u95ee\u9700\u8981\u6211\u505a\u4ec0\u4e48\uff1f",
         "问候 + 空泛询问（「请问需要」不是「请问您」）"),
    ):
        if not fn(text):
            ok(f"未命中：{note}")
        else:
            bad(f"误判成出戏：{note}")

    print(f"\n结果：PASS={PASS}  FAIL={FAIL}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
