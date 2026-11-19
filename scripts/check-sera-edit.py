"""SeraEdit 接入回归验证（自包含，不触碰 5173 服务）。

用法： python scripts/check-sera-edit.py
验证：适配层 import、中文指令、preview/apply/undo、错误输入、护栏路由、
      原谱不被覆盖。全部用临时端口 + 内存服务，可安全反复运行。
"""
import os, sys, json, io, glob, threading
import xml.etree.ElementTree as ET
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
CACHE = os.path.join(ROOT, ".sites-runtime", "score-cache")

MINI_XML = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>check</work-title></work>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions>
<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>
<clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
</measure></part></score-partwise>"""


def sample_xml():
    """Prefer a real cached score; fall back to a tiny built-in score."""
    for f in sorted(glob.glob(os.path.join(CACHE, "*.json")))[:60]:
        if f.endswith(".metadata.json"):
            continue
        try:
            x = json.load(open(f, encoding="utf-8")).get("xml")
            if isinstance(x, str) and x.lstrip().startswith("<?xml") and len(x) < 4_000_000:
                return x
        except Exception:
            pass
    return MINI_XML


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.startswith("/api/sera-edit/"):
            import sera_bridge
            return sera_bridge.handle(self)
        return self.json_response({"error": "not found"}, 404)


def post(port, action, payload):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/sera-edit/{action}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def main():
    failures = []

    def check(label, cond, extra=""):
        print(("  PASS " if cond else "  FAIL ") + label + (("  " + str(extra)) if extra else ""))
        if not cond:
            failures.append(label)

    xml = sample_xml()
    print("SeraEdit 接入回归验证（临时端口，未触碰 5173）")
    print(f"输入谱长度: {len(xml)} 字节")

    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        s, d = post(port, "status", {})
        check("status 引擎可用", s == 200 and d.get("ok") and d.get("version") == "1.0.0", d.get("engine"))
        check("零第三方依赖", d.get("dependencies") == "standard library only")
        check("非阻断校验模式", d.get("mode") == "non-blocking validation")

        s, d = post(port, "preview", {"xml": xml, "instruction": "把第1小节升高一个半音"})
        check("中文指令生成提案", s == 200 and d.get("ok") and bool(d.get("revised_xml")), d.get("summary"))
        check("提案含变化数", isinstance(d.get("change_count"), int) and d["change_count"] > 0,
              d.get("change_count"))
        check("校验警告降级为提示", isinstance(d.get("warnings"), list))
        revised = d.get("revised_xml")

        s, a = post(port, "apply", {"session_id": "check", "source_xml": xml,
                                    "revised_xml": revised, "instruction": "升高一个半音"})
        check("apply 保存修订", s == 200 and a.get("ok") and a.get("xml") == revised)

        s, u = post(port, "undo", {"session_id": "check"})
        check("undo 还原原谱", s == 200 and u.get("ok") and u.get("restored_original") is True)

        s, e = post(port, "preview", {"xml": "<bad/>", "instruction": "升高一个半音"})
        check("非法输入被拒绝", s == 400 and e.get("ok") is False, e.get("error"))
        s, e2 = post(port, "preview", {"xml": xml, "instruction": "给我即兴写八小节"})
        check("越界意图不硬改谱", (not e2.get("ok")) or e2.get("change_count") == 0)

        # 多声部守恒守卫：Sera 的 musicxml_to_score_document 只保留最后 1 个
        # part，历史上会把 3-part/5206 音符的 OMR 谱导出成只剩 1-part/1029 音符，
        # 静默吞掉 2/3 谱面。这里用自包含 2-part 谱断言修订后 part 数与音符数
        # 全部守恒；并断言中文数字越界（仅 1 小节却说"第二小节"）被拒。
        TWO_PART = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>2p</work-title></work>
<part-list><score-part id="P1"><part-name>R</part-name></score-part>
<score-part id="P2"><part-name>L</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions>
<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>
<clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
</measure></part>
<part id="P2"><measure number="1"><attributes><divisions>4</divisions>
<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>
<clef><sign>F</sign><line>4</line></clef></attributes>
<note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><pitch><step>F</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
</measure></part></score-partwise>"""

        # 多小节自包含谱（单 part、3 小节各 2 音、初始无 <dynamics>），用于断言
        # 整段力度意图写到【全部小节】、点名小节意图只写【该小节】。
        MULTI_MEASURE = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>R</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions>
<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>
<clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure>
<measure number="2"><note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure>
<measure number="3"><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure>
</part></score-partwise>"""

        def _dyn_per_measure(x):
            r = ET.fromstring(x)
            out = {}
            for m in r.iter("measure"):
                n = int(m.get("number") or 0)
                out[n] = sum(1 for nn in m.findall("note") if nn.find(".//dynamics") is not None)
            return out

        def _ncount(x):
            r = ET.fromstring(x)
            return sum(1 for n in r.iter("note")
                       if n.find("rest") is None and n.find("pitch") is not None)

        def _pcount(x):
            return len(ET.fromstring(x).findall("part"))

        s, d2 = post(port, "preview", {"xml": TWO_PART, "instruction": "把第1小节升高一个半音"})
        ok2 = s == 200 and d2.get("ok")
        check("多声部谱生成提案", ok2, d2.get("summary"))
        if ok2:
            src_n, src_p = _ncount(TWO_PART), _pcount(TWO_PART)
            rev_n, rev_p = _ncount(d2["revised_xml"]), _pcount(d2["revised_xml"])
            check("多声部 音符守恒", rev_n == src_n, f"{rev_n} vs {src_n}")
            check("多声部 part 守恒", rev_p == src_p, f"{rev_p} vs {src_p}")
            check("多声部 标记 source_preserving", d2.get("source_preserving") is True)

        # 调号 / 拍号 必须真正写进原谱（曾因 _apply_minimal 未落地而静默 0 改动）。
        s, dk = post(port, "preview", {"xml": TWO_PART, "instruction": "把调号改成G大调"})
        okk = s == 200 and dk.get("ok")
        check("调号编辑生成提案", okk, dk.get("summary"))
        if okk:
            revk = dk["revised_xml"].replace(" ", "")
            check("调号 真改入谱(fifths=1)", "<fifths>1</fifths>" in revk, "G大调")
            check("调号 音符守恒", _ncount(dk["revised_xml"]) == _ncount(TWO_PART))
            check("调号 part 守恒", _pcount(dk["revised_xml"]) == _pcount(TWO_PART))

        s, dt = post(port, "preview", {"xml": TWO_PART, "instruction": "把拍号改成3/4"})
        okt = s == 200 and dt.get("ok")
        check("拍号编辑生成提案", okt, dt.get("summary"))
        if okt:
            revt = dt["revised_xml"].replace(" ", "")
            check("拍号 真改入谱(3/4)",
                  "<beats>3</beats>" in revt and "<beat-type>4</beat-type>" in revt)
            check("拍号 音符守恒", _ncount(dt["revised_xml"]) == _ncount(TWO_PART))
            check("拍号 part 守恒", _pcount(dt["revised_xml"]) == _pcount(TWO_PART))

        # 力度 / 断奏 也必须真正写进原谱（历史上只测了移调，这两类若未落地会静默 0 改动，
        # 与调号/拍号同类）。断言修订谱真的出现 <dynamics>/<articulations> 且音符/part 守恒。
        s, ddyn = post(port, "preview", {"xml": TWO_PART, "instruction": "力度改为ff"})
        okdyn = s == 200 and ddyn.get("ok")
        check("力度编辑生成提案", okdyn, ddyn.get("summary"))
        if okdyn:
            revd = ddyn["revised_xml"].replace(" ", "")
            check("力度 真改入谱(<dynamics>)", "<dynamics>" in revd)
            check("力度 change_count>0", ddyn.get("change_count", 0) > 0, ddyn.get("change_count"))
            check("力度 音符守恒", _ncount(ddyn["revised_xml"]) == _ncount(TWO_PART))
            check("力度 part 守恒", _pcount(ddyn["revised_xml"]) == _pcount(TWO_PART))

        # 整段力度兜底（2026-11-12 新增）：Sera 规则层只做逐音符力度，对「把力度改成强」
        # 「力度大一点」这类整段/整小节表述原会判 unsupported。适配层识别后直接构造
        # set_dynamic 补丁，逐音符落写 <dynamics>。断言：ok + 真含 <dynamics> + 音符/part 守恒。
        for whole_dyn in ["把力度改成强", "把第1小节力度改成弱", "力度大一点"]:
            s, dwd = post(port, "preview", {"xml": TWO_PART, "instruction": whole_dyn})
            okwd = s == 200 and dwd.get("ok")
            check(f"整段力度生成提案: {whole_dyn[:8]}", okwd, dwd.get("summary"))
            if okwd:
                revw = dwd["revised_xml"].replace(" ", "")
                check(f"整段力度 真改入谱(<dynamics>): {whole_dyn[:8]}", "<dynamics>" in revw)
                check(f"整段力度 change_count>0: {whole_dyn[:8]}", dwd.get("change_count", 0) > 0, dwd.get("change_count"))
                check(f"整段力度 音符守恒: {whole_dyn[:8]}", _ncount(dwd["revised_xml"]) == _ncount(TWO_PART))
                check(f"整段力度 part 守恒: {whole_dyn[:8]}", _pcount(dwd["revised_xml"]) == _pcount(TWO_PART))

        # 整段力度作用域守卫（2026-11-12 修复后新增）：兜底的整段意图曾复用 Sera 默认
        # 作用域 {"measures":[1]}，使「把力度改成强」整首意图只改了第 1 小节。用 3 小节
        # 谱断言：整段意图写到【全部小节】、点名小节意图只写【该小节】。
        s, dwhole = post(port, "preview", {"xml": MULTI_MEASURE, "instruction": "把力度改成强"})
        okw = s == 200 and dwhole.get("ok")
        check("整段力度作用域·生成提案", okw, dwhole.get("summary"))
        if okw:
            dw = _dyn_per_measure(dwhole["revised_xml"])
            check("整段力度作用域·写到全部小节", all(dw.get(n, 0) > 0 for n in (1, 2, 3)), dw)
            check("整段力度作用域·音符守恒", _ncount(dwhole["revised_xml"]) == _ncount(MULTI_MEASURE))

        s, dmeas = post(port, "preview", {"xml": MULTI_MEASURE, "instruction": "把第2小节力度改成弱"})
        okm = s == 200 and dmeas.get("ok")
        check("指定小节力度作用域·生成提案", okm, dmeas.get("summary"))
        if okm:
            dm = _dyn_per_measure(dmeas["revised_xml"])
            check("指定小节力度作用域·仅目标小节有dynamics",
                  dm.get(2, 0) > 0 and dm.get(1, 0) == 0 and dm.get(3, 0) == 0, dm)
            check("指定小节力度作用域·音符守恒", _ncount(dmeas["revised_xml"]) == _ncount(MULTI_MEASURE))

        # 装饰音谱守卫（2026-11-13）：<grace> 按 MusicXML 规范不写 <duration>，
        # 历史上 _assert_parseable 要求每个非休止音符 duration>0 → 把合法装饰音误判
        # 「无效时值」，含装饰音的谱任何编辑都 HTTP 400（曲库第一首「后来」整首不可编辑）。
        # 修复 = 校验器与 dist/score.js:23 一样跳过 grace。断言这类谱可编辑且装饰音保留。
        GRACE_SCORE = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>R</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions>
<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>
<clef><sign>G</sign><line>2</line></clef></attributes>
<note><grace slash="yes"/><pitch><step>E</step><octave>4</octave></pitch><type>eighth</type></note>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
</measure></part></score-partwise>"""
        for gins in ["把第1小节升高一个半音", "把力度改成强"]:
            s, dg = post(port, "preview", {"xml": GRACE_SCORE, "instruction": gins})
            okg = s == 200 and dg.get("ok") is True
            check(f"装饰音谱可编辑: {gins[:8]}", okg, f"HTTP {s} {dg.get('error') or dg.get('status')}")
            if okg:
                check(f"装饰音谱 保留<grace>: {gins[:8]}", "<grace" in dg["revised_xml"])
                check(f"装饰音谱 音符守恒: {gins[:8]}", _ncount(dg["revised_xml"]) == _ncount(GRACE_SCORE))

        # 无音高（<unpitched> 打击乐）谱守卫（2026-11-13）：这类音符没有 <pitch>，
        # 下游 dist/score.js:23 用 midi-unpitched 定音高并明确允许；_assert_parseable
        # 曾因 `pitch is None` 误判「无音高音符」，让全曲库 5.8%（263 首 ready 谱）
        # 含打击乐的谱任何编辑都 400。断言可编辑 + 保留 <unpitched> + 音符守恒；
        # 并断言「既无 pitch 又无 unpitched」的真畸形音符仍被拒（安全底线不放宽）。
        UNPITCHED_SCORE = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>R</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions>
<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>
<clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
<note><unpitched><display-step>C</display-step><display-octave>4</display-octave></unpitched>
<duration>4</duration><type>quarter</type><instrument id="I1"/></note>
</measure></part></score-partwise>"""
        for uins in ["把第1小节升高一个半音", "把力度改成强"]:
            s, du = post(port, "preview", {"xml": UNPITCHED_SCORE, "instruction": uins})
            oku = s == 200 and du.get("ok") is True
            check(f"打击乐谱可编辑: {uins[:8]}", oku, f"HTTP {s} {du.get('error') or du.get('status')}")
            if oku:
                check(f"打击乐谱 保留<unpitched>: {uins[:8]}", "<unpitched" in du["revised_xml"])
                check(f"打击乐谱 音符守恒: {uins[:8]}", _ncount(du["revised_xml"]) == _ncount(UNPITCHED_SCORE))
        # 安全底线：真畸形音符（无 pitch、无 unpitched、非 grace、非 rest）必须仍被拒
        MALFORMED_SCORE = UNPITCHED_SCORE.replace(
            '<note><unpitched><display-step>C</display-step><display-octave>4</display-octave></unpitched>\n<duration>4</duration><type>quarter</type><instrument id="I1"/></note>',
            '<note><duration>4</duration><type>quarter</type></note>')
        s, dmf = post(port, "preview", {"xml": MALFORMED_SCORE, "instruction": "把第1小节升高一个半音"})
        check("真畸形音符仍被拒（安全底线）", not dmf.get("ok"), f"HTTP {s} {dmf.get('error')}")

        s, dart = post(port, "preview", {"xml": TWO_PART, "instruction": "加上断奏"})
        okart = s == 200 and dart.get("ok")
        check("断奏编辑生成提案", okart, dart.get("summary"))
        if okart:
            reva = dart["revised_xml"].replace(" ", "")
            check("断奏 真改入谱(<articulations>)", "<articulations>" in reva)
            check("断奏 change_count>0", dart.get("change_count", 0) > 0, dart.get("change_count"))
            check("断奏 音符守恒", _ncount(dart["revised_xml"]) == _ncount(TWO_PART))
            check("断奏 part 守恒", _pcount(dart["revised_xml"]) == _pcount(TWO_PART))

        # 通用「绝不静默 0 改动」守卫：一批已知可生成的指令，预览必须 ok 且修订谱≠原谱。
        # 直接固化「AI 放行的每种操作都要真落盘」这一铁律，任何未来回归都会在此暴露。
        for good in ["把第1小节升高一个半音", "把调号改成G大调", "把拍号改成3/4",
                     "力度改为ff", "加上断奏"]:
            s, dg = post(port, "preview", {"xml": TWO_PART, "instruction": good})
            changed = bool(dg.get("revised_xml")) and dg.get("revised_xml") != TWO_PART
            check(f"绝不静默0改动: {good[:10]}", s == 200 and dg.get("ok") and changed,
                  dg.get("change_count"))

        s, d3 = post(port, "preview", {"xml": TWO_PART, "instruction": "把第 99 小节升高一个半音"})
        check("远超上限的小节号 → 越界被拒",
              s == 200 and d3.get("ok") is False and d3.get("status") == "out_of_range",
              d3.get("status"))
    finally:
        srv.shutdown()
        srv.server_close()

    # 护栏路由（真实 ai_workspace.fast_plan）
    try:
        import ai_workspace as A
        def acts(t):
            r = A.fast_plan({"messages": [{"role": "user", "content": t}], "context": {}})
            return [x.get("type") for x in (r or {}).get("actions", [])] if isinstance(r, dict) else None
        check("编辑意图 → edit_score", acts("把第3小节升高一个半音") == ["edit_score"])
        check("常规动作不被误伤", acts("帮我找带减七和弦的曲子") == ["web_search"])
        check("越界意图不生成 edit_score", acts("帮我标一下指法") not in (["edit_score"],))
        # 疑问句/否定句不得被劫持成改谱动作（千轮实测护栏）。
        for q in ["第12小节能不能升半音？", "能把第5小节升半音吗？",
                  "我想问一下移调怎么弄", "这一段可以升调吗？", "不要把第3小节升半音"]:
            check(f"疑问句/否定句不劫持：{q[:12]}", acts(q) != ["edit_score"])
    except Exception as exc:
        check("护栏路由可导入", False, f"{type(exc).__name__}: {exc}")

    print("\n结果:", "全部通过" if not failures else f"{len(failures)} 项失败: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
