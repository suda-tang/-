# -*- coding: utf-8 -*-
"""流式回复提取器的守护检查（纯函数，不需要服务和模型）。

背景：`ai_workspace.py` 的 `ReplyStreamExtractor` 负责在流式过程中
把模型写的 `{"reply":"…","actions":[…]}` 里的 reply 内容**边写边吐**给前端，
让用户不必干等（2026-10-07 唐老师要求）。

这个提取器有两个极易写错的地方，必须守住：
  1. **转义**：模型会把换行写成 `\\n`、引号写成 `\\"`、中文写成 `\\uXXXX`。
     直接把原始字符吐出去，用户会看到字面的 `\\n` 和 `\\u4e2d`。
  2. **分块边界**：`"reply"` 这个键名、以及 `\\n` 这种转义序列，
     都可能正好被切在两个 SSE 分块之间。切错就会吞字符或显示错。
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

spec = importlib.util.spec_from_file_location("ai_workspace", os.path.join(ROOT, "ai_workspace.py"))
aw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(aw)

FAILED = []


def check(name, got, want):
    if got == want:
        print(f"PASS {name}")
    else:
        print(f"FAIL {name}\n     得到: {got!r}\n     期望: {want!r}")
        FAILED.append(name)


def run(chunks):
    """按给定分块喂入，返回累计吐出的文本。"""
    ex = aw.ReplyStreamExtractor()
    out = []
    for chunk in chunks:
        out.append(ex.feed(chunk))
    return "".join(out)


def one_shot(text):
    return run([text])


# 1. 最基本的 JSON：只应吐出 reply 的内容，actions 不显示
check(
    "普通 JSON 只吐 reply",
    one_shot('{"reply":"正在为你打开《知足》。","actions":[{"type":"open","value":"abc"}]}'),
    "正在为你打开《知足》。",
)

# 2. 逐字符喂（最极端的分块）—— 结果必须和一次性喂一样
payload = '{"reply":"你好，我来帮你。","actions":[]}'
check("逐字符分块", run(list(payload)), "你好，我来帮你。")

# 3. "reply" 键名被切在两块之间（这是最容易漏的边界）
check(
    "键名被切断",
    run(['{"rep', 'ly":"答', '案","actions":[]}']),
    "答案",
)

# 4. 转义序列 \\n 被切在两块之间 —— 不能显示成字面的 n
check(
    "转义 \\n 被切断",
    run(['{"reply":"第一行\\', 'n第二行","actions":[]}']),
    "第一行\n第二行",
)

# 5. 各种转义：引号、反斜杠、制表符、\\uXXXX
check(
    "常见转义解码",
    one_shot('{"reply":"他说\\"好\\"\\n然后\\\\走了\\t完事","actions":[]}'),
    '他说"好"\n然后\\走了\t完事',
)
check("\\uXXXX 解码", one_shot('{"reply":"\\u4e2d\\u6587","actions":[]}'), "中文")

# 6. 键序颠倒（模型有时先给 actions）
check(
    "actions 在前也能提取",
    one_shot('{"actions":[],"reply":"倒序也没问题"}'),
    "倒序也没问题",
)

# 7. 带 ```json 代码块包裹
check(
    "代码块包裹",
    one_shot('```json\n{"reply":"包裹也认","actions":[]}\n```'),
    "包裹也认",
)

# 8. 非 JSON（模型直接说人话）—— 超过阈值后必须原样吐出，不能吞掉
plain = "我" * 2100
check("非 JSON 原样吐出", one_shot(plain), plain)

# 9. reply 为空串
check("空 reply", one_shot('{"reply":"","actions":[]}'), "")

# 10. reply 后面还有别的字段，不应把后面的内容带出来
check(
    "reply 之后的内容不泄露",
    one_shot('{"reply":"只有这句","note":"这句不该出现"}'),
    "只有这句",
)

# 11. 前缀是空增量，不应破坏状态
check(
    "夹杂空增量",
    run(['{"reply":', '', '"分', '', '块', '', '正常","actions":[]}']),
    "分块正常",
)

print()
if FAILED:
    print(f"FAIL 流式回复提取（{len(FAILED)} 项不通过）：" + "、".join(FAILED))
    sys.exit(1)
print("PASS 流式回复提取（转义 / 分块边界 / 非 JSON 兜底）")
