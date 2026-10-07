# -*- coding: utf-8 -*-
"""回归测试：直连模式必须剥掉上游免责尾注（且不能在流式途中漏出去）。

背景（2026-10-01，切直连后自查发现）：
免责尾注的判据原本只写在 `suda_broker.py`（页面驱动）里 —— broker 轮询 DOM 时顺手剥掉了。
切到 WebSocket 直连后，直连拿的是**上游原始文本**、根本不经过 broker，尾注就原样漏给了用户。

实测证据（直连模式，长回答 324 字）：
    尾注「以上来源AI自动生成，仅作参考！」从第 308 字开始，
    最后 3 个 delta 是「生成，」「仅作」「参考！」

难点在于**流式**：尾注只在最后几个 delta 出现，边收边发就收不回来了。
所以 `_stream_tail_guard` 把尾部压住不发，收尾时剥掉再补发。
本文件锁两条：
  ① 判据共用（不许再各写一份，否则必然一边修一边漏）；
  ② 流式过程中**任何一帧都不能出现尾注**（不是「最终文本对」就行）。

    python test_footer_guard.py
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import suda_api  # noqa: E402
import suda_text  # noqa: E402

FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))
    if not ok:
        FAILURES.append(name)


FOOTER = "以上来源AI自动生成，仅作参考！"
FOOTER_BRACKETED = "（以上来源AI自动生成，仅作参考！）"

# ── ① 判据：该剥的剥、不该剥的不剥 ───────────────────────────────────
check("无括号尾注被识别", suda_text.is_footer_line(FOOTER))
check("全角括号尾注被识别", suda_text.is_footer_line(FOOTER_BRACKETED))
check("前后带空格也能识别", suda_text.is_footer_line("  " + FOOTER + "  "))
# 下面这条是**阳性对照实机抓到的真 bug**（2026-10-01）：
# 上游会发 markdown 加粗包裹的尾注，第一版正则不认星号，直接漏给用户。
# 页面模式看不出来（DOM 里 `**…**` 已渲染成 <strong>），只有直连会踩到。
check("markdown 加粗包裹的尾注被识别（实机抓到）",
      suda_text.is_footer_line(f"**{FOOTER}**"))
check("markdown 斜体包裹的尾注被识别", suda_text.is_footer_line(f"*{FOOTER}*"))
check("markdown 引用块里的尾注被识别", suda_text.is_footer_line(f"> {FOOTER}"))
check("列表项里的尾注被识别", suda_text.is_footer_line(f"- {FOOTER}"))
check("下划线加粗包裹的尾注被识别", suda_text.is_footer_line(f"__{FOOTER}__"))
check("正文正常句子不被误判",
      not suda_text.is_footer_line("以上是我生成的代码，请参考文档第 3 节。"))
check("超过长度上限的长句不被误判",
      not suda_text.is_footer_line(
          "以上内容由AI根据你提供的原始材料整理并作参考，如果你需要更详细的信息，"
          "请告诉我具体想了解哪一部分，我可以继续补充说明。"))
check("空行不算尾注", not suda_text.is_footer_line(""))

check("尾部尾注被剥掉（连同前面的空行）",
      suda_text.strip_footer(f"正文第一行\n正文第二行\n\n{FOOTER}") == "正文第一行\n正文第二行",
      repr(suda_text.strip_footer(f"正文第一行\n正文第二行\n\n{FOOTER}")))
check("尾部 markdown 加粗尾注被整行剥掉",
      suda_text.strip_footer(f"正文第一行\n正文第二行\n\n**{FOOTER}**") == "正文第一行\n正文第二行",
      repr(suda_text.strip_footer(f"正文第一行\n正文第二行\n\n**{FOOTER}**")))
check("无尾注时原样返回",
      suda_text.strip_footer("正文第一行\n正文第二行") == "正文第一行\n正文第二行")
check("正文中间的同句式行**不能**被删",
      suda_text.strip_footer(f"先说一句\n{FOOTER}\n后面还有正文") == f"先说一句\n{FOOTER}\n后面还有正文")

# ── ② 判据必须共用（防止有人又在 broker 里写回一份） ─────────────────
src = io.open(os.path.join(HERE, "suda_broker.py"), encoding="utf-8").read()
check("broker 从 suda_text 引入尾注判据", "from suda_text import" in src and "is_footer_line" in src)
check("broker 不再自己定义 FOOTER_PATTERNS", "FOOTER_PATTERNS = (" not in src)
api_src = io.open(os.path.join(HERE, "suda_api.py"), encoding="utf-8").read()
check("api 也用的是同一个 strip_footer", "from suda_text import strip_footer" in api_src)
check("api 不再自己定义 FOOTER_PATTERNS", "FOOTER_PATTERNS = (" not in api_src)

# ── ③ 流式尾部守卫：任何一帧都不许出现尾注 ──────────────────────────
# 模仿真实形状：大量 1~5 字的碎帧，尾注被切成几段出现在最后。
# 正文要**明显长于压住长度**（FOOTER_HOLD_CHARS，默认 80），
# 否则整段都会被压在尾部、收尾时一次性发出 —— 那是正确行为，不是 bug。
body = ("苏州园林讲究移步换景，拙政园以水为中心，留园以建筑见长，网师园小而精。"
        "沧浪亭以复廊借景，狮子林以假山取胜，耦园枕水而居，艺圃清幽如野。"
        "叠山理水、栽花植木，厅堂轩榭各有章法，楹联题刻常含诗画哲理。") * 2
assert len(body) > suda_api.FOOTER_HOLD_CHARS * 2, "正文太短，测不出分帧行为"
chunks = [body[i:i + 3] for i in range(0, len(body), 3)] + ["\n\n", "以上来源", "AI自动", "生成，", "仅作", "参考！"]
emitted = list(suda_api._stream_tail_guard(chunks))
joined = "".join(emitted)
check("流式：最终文本不含尾注", "以上来源" not in joined and "参考！" not in joined,
      f"got {joined[-40:]!r}")
check("流式：最终文本 == 正文（一字不差）", joined == body, f"got {joined[-60:]!r}")
check("流式：过程中**任何一帧**都没漏出尾注",
      all("以上来源" not in e and "参考！" not in e for e in emitted),
      f"frames={emitted[-4:]!r}")
check("流式：确实是分多帧发出的（不是攒到最后一次性给）", len(emitted) >= 5,
      f"frames={len(emitted)}")
check("流式：首帧之后就开始出内容（尾部压住 ≤ FOOTER_HOLD_CHARS）",
      len(emitted) > 1 and len(emitted[0]) <= 8, f"first={emitted[0]!r}")

# ③b 无尾注时内容不能丢
plain = ["第一段内容", "第二段内容", "结尾。"]
check("流式：无尾注时内容完整",
      "".join(suda_api._stream_tail_guard(plain)) == "".join(plain),
      repr("".join(suda_api._stream_tail_guard(plain))))

# ③c 短回答（小于压住长度）也必须正常发出
check("流式：短回答也能完整发出",
      "".join(suda_api._stream_tail_guard(["你好"])) == "你好")
check("流式：短回答带尾注时只留正文",
      "".join(suda_api._stream_tail_guard(["你好\n\n", FOOTER])) == "你好",
      repr("".join(suda_api._stream_tail_guard(["你好\n\n", FOOTER]))))

# ③c3 边界回归：压住边界**正好落在换行符上**时，不能丢掉那个换行。
# 实测踩到（2026-10-01，`test_footer_live.py` 逐字比对才发现）：
# `strip_footer` 末尾用 `strip()` 会把「压住的尾巴」开头的换行一起吃掉，
# 客户端收到的正文就少一个换行 —— 文本看着没错，只有逐字比对能发现。
for k in (10, 40, 79):
    boundary_body = "A" * k + "\n" + "B" * 79   # 让 len-80 恰好落在 "\n" 上
    got = "".join(suda_api._stream_tail_guard([boundary_body]))
    check(f"边界落在换行符上不丢字符（k={k}）", got == boundary_body,
          f"len {len(got)} vs {len(boundary_body)}")
# 带尾注时同样不能丢
for k in (10, 79):
    boundary_body = "A" * k + "\n" + "B" * 79
    got = "".join(suda_api._stream_tail_guard([boundary_body + "\n\n" + FOOTER]))
    check(f"边界落在换行符上、且带尾注时不丢正文（k={k}）", got == boundary_body,
          f"got len {len(got)} want {len(boundary_body)}")
check("strip_footer 不删行首空白（只削尾部）",
      suda_text.strip_footer("\n正文") == "\n正文",
      repr(suda_text.strip_footer("\n正文")))
check("strip_footer 仍会剥掉整段都是空行的尾部",
      suda_text.strip_footer("正文\n\n\n") == "正文",
      repr(suda_text.strip_footer("正文\n\n\n")))

# ③c2 markdown 加粗尾注在**流式**里也不能漏（实机阳性对照就是这里漏的）
md_chunks = [body[i:i + 3] for i in range(0, len(body), 3)] + ["\n\n", "**以上来源", "AI自动", "生成，", "仅作", "参考！**"]
md_frames = list(suda_api._stream_tail_guard(md_chunks))
md_joined = "".join(md_frames)
check("流式：markdown 加粗尾注最终被剥掉", md_joined == body, f"got {md_joined[-40:]!r}")
check("流式：markdown 加粗尾注没有任何一帧漏出",
      all("以上来源" not in f and "参考" not in f for f in md_frames),
      f"frames={md_frames[-4:]!r}")

# ③d 真实抓包回放：用**实测抓到的 148 帧**（含尾注）再验一遍。
# 夹具是 2026-10-01 直连模式下真实抓到的一次长回答 SSE，
# 里面确实带着上游尾注，比合成数据可信。
real = os.path.join(HERE, "fixtures", "real_sse_with_footer.txt")
if os.path.exists(real):
    import json as _json
    frames = []
    for line in io.open(real, encoding="utf-8"):
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            continue
        try:
            event = _json.loads(payload)
        except ValueError:
            continue
        content = (event.get("choices") or [{}])[0].get("delta", {}).get("content")
        if content:
            frames.append(content)
    if frames:
        out = "".join(suda_api._stream_tail_guard(frames))
        check(f"真实抓包回放（{len(frames)} 帧）：尾注被剥掉",
              "以上来源" not in out and "参考！" not in out, f"got {out[-40:]!r}")
        check("真实抓包回放：正文保留到「闻名。」结尾",
              out.endswith("闻名。"), f"got {out[-30:]!r}")
else:
    print("SKIP  真实抓包回放（fixtures/real_sse_with_footer.txt 不在）")

print()
if FAILURES:
    print(f"{len(FAILURES)} 项未通过：" + ", ".join(FAILURES))
    sys.exit(1)
print("全部通过")
