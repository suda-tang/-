"""前后端「谱面合法性」校验器契约测试（防止后端比下游解析器更严）。

背景（2026-11-13 连修两次同类 bug 后的机制化收口）：
  * 后端 `sera_bridge.py::_assert_parseable` 是编辑输出的合法性硬检查，
    注释写着 "Mirror the hard requirements of dist/score.js parseMusicXML"。
  * 但它曾两次**比下游更严**，把前端本来能正常渲染的合法谱误杀成 HTTP 400：
      - `<grace>` 装饰音（按规范不写 `<duration>`）——曾让曲库第一首「后来」整首不可编辑；
      - `<unpitched>` 打击乐音符（没有 `<pitch>`）——影响 263 首线上 ready 谱。
  * 根因都是「后端照抄了下游的硬要求，却漏抄了下游的跳过/容错清单」。

本脚本把「下游真实解析器」直接作为判据：在浏览器里 `import('/score.js')` 调用
**真实前端** `parseMusicXML`，与后端 `_assert_parseable` 对同一批谱的接受/拒绝做比对。

核心契约（单向蕴含）：**前端能正常渲染的合法谱 ⇒ 后端编辑校验必须放行**。
这正好覆盖两次历史 bug 的方向；任何未来再出现「后端比下游更严」的漏网都会在此暴露。

两处**刻意的策略差异**（白名单，不是 bug，防止被顺手「修好」破坏安全底线）：
  1. malformed（既无 pitch 又无 unpitched 的畸形音符）：前端 accept 但标记
     unsupported=true（跳过该音符仍渲染其余）；后端 reject。这是「绝不放行残缺谱」
     的安全底线，方向为后端更严且只针对畸形数据，故意保留。
  2. grace_only（整谱只有装饰音、无可演奏音符）：前端 reject（没有识别到可演奏的
     有音高音符）；后端 accept。这类谱用户根本打不开，实际不可达，且方向与两次
     历史 bug 相反（后端更宽），不构成用户可见故障，故意保留。

前提：本地 5173 在跑（要 serve /score.js）；`.sites-runtime/score-cache/` 有缓存谱
（没有也能跑，只是跳过真实谱抽样）。
用法：python scripts/check-validator-parity.py
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sera_bridge as sb
from playwright.sync_api import sync_playwright

CHROME = r"C:/Users/mail/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe"
URL = "http://127.0.0.1:5173/"

# ---- 自包含边界夹具 ---------------------------------------------------------
H = ('<?xml version="1.0" encoding="UTF-8"?>'
     '<score-partwise version="4.0"><part-list>'
     '<score-part id="P1"><part-name>R</part-name></score-part></part-list>'
     '<part id="P1"><measure number="1"><attributes><divisions>4</divisions>'
     '<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type>'
     '</time></attributes>')
T = '</measure></part></score-partwise>'
N = ('<note><pitch><step>C</step><octave>4</octave></pitch>'
     '<duration>4</duration><type>quarter</type></note>')
G = ('<note><grace slash="yes"/><pitch><step>E</step><octave>4</octave></pitch>'
     '<type>eighth</type></note>')
U = ('<note><unpitched><display-step>C</display-step>'
     '<display-octave>4</display-octave></unpitched>'
     '<duration>4</duration><type>quarter</type><instrument id="I1"/></note>')
R = '<note><rest/><duration>4</duration><type>quarter</type></note>'
C = ('<note><chord/><pitch><step>E</step><octave>4</octave></pitch>'
     '<duration>4</duration><type>quarter</type></note>')
MF = '<note><duration>4</duration><type>quarter</type></note>'          # 既无 pitch 又无 unpitched
ND = '<note><pitch><step>C</step><octave>4</octave></pitch><type>quarter</type></note>'
UND = ('<note><unpitched><display-step>C</display-step>'
       '<display-octave>4</display-octave></unpitched><type>quarter</type></note>')

# kind: legal=前端合法谱(核心契约, 后端必须放行) / whitelist=刻意差异
FIXTURES = {
    "normal":            (H + N + N + T, "legal"),
    "grace":             (H + G + N + T, "legal"),
    "unpitched":         (H + N + U + T, "legal"),
    "rest":              (H + N + R + T, "legal"),
    "chord":             (H + N + C + T, "legal"),
    "grace_unpitched":   (H + G + N + U + T, "legal"),   # 两类历史 bug 同谱
    "unpitched_no_dur":  (H + N + UND + T, "invalid"),    # 无 duration：两边都应拒
    "no_duration":       (H + N + ND + T, "invalid"),
    "malformed":         (H + N + MF + T, "whitelist_strict"),  # 后端故意更严(安全底线)
    "grace_only":        (H + G + T, "whitelist_loose"),        # 后端故意更宽(不可达)
}

# 前端判定脚本：返回 {name: {accept, unsupported, events, error}}
JS_BATCH = """async (cases) => {
    const mod = await import('/score.js');
    const out = {};
    for (const [name, xml] of Object.entries(cases)) {
        try {
            const s = mod.parseMusicXML(xml, 't');
            out[name] = {accept: true, unsupported: !!s.unsupported,
                         events: (s.events || []).length};
        } catch (e) {
            out[name] = {accept: false, error: String(e.message || e)};
        }
    }
    return out;
}"""


def backend_accept(xml):
    """后端 _assert_parseable 是否放行（它作用于修订输出，结构与源谱一致，
    故直接对源谱判定即等价——两次历史 bug 也是这样复现的）。"""
    try:
        sb._assert_parseable(xml)
        return True, None
    except Exception as exc:  # noqa: BLE001 - 校验器就是靠抛异常表达拒绝
        return False, str(exc)


def sample_real_scores(limit_per_kind=3):
    """文本级挑真实缓存谱：各取若干含 grace / 含 unpitched / 普通谱，控制大小与数量。"""
    picked = {"grace": [], "unpitched": [], "plain": []}
    files = sorted(f for f in glob.glob(".sites-runtime/score-cache/*.json")
                   if not f.endswith(".metadata.json"))
    for f in files:
        if all(len(v) >= limit_per_kind for v in picked.values()):
            break
        try:
            raw = open(f, encoding="utf-8").read()
            x = json.loads(raw).get("xml")
            if not (isinstance(x, str) and x.lstrip().startswith("<?xml")
                    and 5000 < len(x) < 1_200_000):
                continue
            if "<grace" in raw and len(picked["grace"]) < limit_per_kind:
                kind = "grace"
            elif "<unpitched" in raw and len(picked["unpitched"]) < limit_per_kind:
                kind = "unpitched"
            elif "<grace" not in raw and "<unpitched" not in raw and len(picked["plain"]) < limit_per_kind:
                kind = "plain"
            else:
                continue
            picked[kind].append((os.path.basename(f)[:10], x))
        except Exception:  # noqa: BLE001 - 坏缓存文件跳过即可
            pass
    return picked


def main():
    failures = []

    def check(label, cond, extra=""):
        print(("  PASS " if cond else "  FAIL ") + label + (("  " + str(extra)) if extra else ""))
        if not cond:
            failures.append(label)

    # 组装待判定集合：边界夹具 + 真实谱抽样
    cases = {name: xml for name, (xml, _kind) in FIXTURES.items()}
    real = sample_real_scores()
    real_names = {}
    for kind, items in real.items():
        for i, (_fid, xml) in enumerate(items):
            key = f"real_{kind}_{i}"
            cases[key] = xml
            real_names[key] = kind
    print("前后端校验器契约测试（浏览器跑真实 parseMusicXML）")
    print("待判定谱面: %d 边界夹具 + %d 真实谱抽样 = %d"
          % (len(FIXTURES), len(real_names), len(cases)))

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True,
                                    args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = browser.new_page()
        page.goto(URL, wait_until="load", timeout=60000)
        # 分批传，避免一次 evaluate 塞太多大谱
        front = {}
        items = list(cases.items())
        for start in range(0, len(items), 6):
            batch = dict(items[start:start + 6])
            front.update(page.evaluate(JS_BATCH, batch))
        browser.close()

    print("\n[1] 核心契约：前端能渲染的【合法谱 / 真实谱】⇒ 后端必须放行")
    legal_done = 0
    for name, (xml, kind) in FIXTURES.items():
        if kind not in ("legal",):
            continue
        f = front.get(name, {})
        b_ok, b_err = backend_accept(xml)
        ok = bool(f.get("accept")) and b_ok
        check(f"合法谱放行: {name}", ok,
              f"前端={'accept' if f.get('accept') else 'reject'} 后端={'accept' if b_ok else 'reject:' + str(b_err)[:20]}")
        legal_done += 1
    for name, kind in real_names.items():
        f = front.get(name, {})
        if not f.get("accept"):
            # 前端自己都拒绝的谱（如无可演奏音符），不在「误杀合法谱」契约范围内，记录不判失败
            print(f"  SKIP 真实谱(name={name} kind={kind}): 前端自身 reject（非误杀范畴）")
            continue
        b_ok, b_err = backend_accept(cases[name])
        check(f"真实谱放行: {name}({kind})", b_ok,
              "" if b_ok else "后端拒绝: " + str(b_err)[:40])
        legal_done += 1

    print("\n[2] 无效数据：两边都应拒绝（duration<=0）")
    for name, (xml, kind) in FIXTURES.items():
        if kind != "invalid":
            continue
        f = front.get(name, {})
        b_ok, _ = backend_accept(xml)
        ok = (not f.get("accept")) and (not b_ok)
        check(f"无效数据两边都拒: {name}", ok,
              f"前端={'accept' if f.get('accept') else 'reject'} 后端={'accept' if b_ok else 'reject'}")

    print("\n[3] 刻意的策略差异白名单（不是 bug，防止被『修好』破坏安全底线）")
    # 3a malformed：前端 accept+unsupported，后端 reject（安全底线）
    f = front.get("malformed", {})
    b_ok, _ = backend_accept(FIXTURES["malformed"][0])
    check("malformed: 后端更严(安全底线)",
          bool(f.get("accept")) and f.get("unsupported") is True and not b_ok,
          f"前端accept={f.get('accept')} unsupported={f.get('unsupported')} 后端accept={b_ok}")
    # 3b grace_only：前端 reject，后端 accept（实际不可达）
    f = front.get("grace_only", {})
    b_ok, _ = backend_accept(FIXTURES["grace_only"][0])
    check("grace_only: 后端更宽(不可达)",
          (not f.get("accept")) and b_ok,
          f"前端accept={f.get('accept')} 后端accept={b_ok}")

    print("\n结果:", "全部通过（前后端校验器契约一致）" if not failures
          else f"{len(failures)} 项失败: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
