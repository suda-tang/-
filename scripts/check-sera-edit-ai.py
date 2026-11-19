"""AI 对话 → edit_score 动作 → 乐谱精准编辑面板 的端到端检查。

不依赖真实模型：用 playwright 拦 /api/workspace-ai 喂桩响应（SSE NDJSON），
验证「用户在 AI 对话里说一句改谱的话」能真的走到编辑提案面板。
前提：本地 5173 在跑、曲库里有 ready 曲谱。

用法： python scripts/check-sera-edit-ai.py
"""
import os, sys, json
from playwright.sync_api import sync_playwright

CHROME = r"C:/Users/mail/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe"
URL = "http://127.0.0.1:5173/"
INSTRUCTION = "把第1小节升高一个半音"

# 与项目 check-ai-action-guard.cjs 相同的桩格式：status / delta / result 三行 NDJSON
def sse(reply, actions):
    return "\n".join([
        json.dumps({"type": "status", "text": "正在安排操作"}, ensure_ascii=False),
        json.dumps({"type": "delta", "text": reply}, ensure_ascii=False),
        json.dumps({"type": "result", "reply": reply, "actions": actions}, ensure_ascii=False),
    ]) + "\n"


def main():
    failures = []

    def check(label, cond, extra=""):
        print(("  PASS " if cond else "  FAIL ") + label + (("  " + str(extra)) if extra else ""))
        if not cond:
            failures.append(label)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True,
                                    args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = browser.new_page(viewport={"width": 1440, "height": 950})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # 桩：模型回一句编辑意图，并产出 edit_score 动作
        stub = sse("我来处理。", [{"type": "edit_score", "value": INSTRUCTION}])
        def on_route(route):
            # Python Playwright: route.request 是属性，不是方法（Node 版才用 route.request()）。
            post = route.request.post_data or ""
            if '"repair"' in post:
                return route.fulfill(status=200, content_type="application/json; charset=utf-8",
                                     body=json.dumps({"reply": "重新核对后仍无法确定可执行的操作。", "actions": []},
                                                     ensure_ascii=False))
            if "/api/workspace-ai" in route.request.url:
                return route.fulfill(status=200, content_type="application/x-ndjson; charset=utf-8",
                                     body=stub)
            return route.continue_()
        page.route("**/api/workspace-ai", on_route)

        page.goto(URL, wait_until="load", timeout=60000)
        try:
            page.wait_for_function("document.documentElement.classList.contains('boot-ready')", timeout=60000)
            check("页面 boot-ready", True)
        except Exception as e:
            check("页面 boot-ready", False, str(e)[:80])

        # 打开一首真实曲谱（编辑面板需要 liveScore）
        opened = page.evaluate("""async () => {
            const r = await fetch('/api/scores'); const d = await r.json();
            const s = (d.scores||[]).find(x=>x.ready);
            if (!s) return {ok:false, err:'曲库没有 ready 曲谱'};
            return await new Promise(resolve=>{
                document.dispatchEvent(new CustomEvent('ai-open-score',{
                    detail:{id:s.id,resolve:()=>resolve({ok:true,title:s.title}),
                            reject:e=>resolve({ok:false,err:String(e)})}}));
                setTimeout(()=>resolve({ok:false,err:'打开曲谱超时'}),30000);
            });
        }""")
        check("打开真实曲谱", bool(opened.get("ok")), opened.get("title") or opened.get("err"))
        page.wait_for_timeout(2500)

        if opened.get("ok"):
            # 在 AI 对话里发一句话（触发桩 → edit_score → ai-edit-score → 面板提案）
            page.locator('#workspace-ai').click()
            page.wait_for_timeout(900)
            page.locator('.ai-conversation input').fill('把第一小节升高一个半音')
            page.locator('.ai-conversation input').press('Enter')
            try:
                # 面板是懒创建的：必须等元素真实存在 + 非隐藏 + 摘要非空。
                # 只写 `!el?.classList.contains(...)` 会在元素不存在时因 !undefined===true
                # 立即返回，读到一堆空值，造成「假 PASS + 后续假 FAIL」。
                page.wait_for_function("""() => {
                    const r = document.querySelector('#sera-review');
                    const s = document.querySelector('#sera-summary');
                    return !!r && !r.classList.contains('sera-hidden') && !!s?.textContent?.trim();
                }""", timeout=90000)
                check("AI 对话触发生成编辑提案", True)
                review = page.evaluate("""() => ({
                    summary: document.querySelector('#sera-summary')?.textContent,
                    msg: document.querySelector('#sera-msg')?.textContent,
                    instruction: document.querySelector('#sera-instruction')?.value,
                    applyVisible: !!document.querySelector('#sera-apply')
                })""")
                check("提案面板显示变化摘要", bool(review.get("summary")), review.get("summary"))
                check("指令回填到编辑面板", review.get("instruction") == INSTRUCTION,
                      review.get("instruction"))
                check("应用按钮可见（需人工确认）", bool(review.get("applyVisible")))
                # AI 消息里应提示去面板确认
                ai_text = page.evaluate(
                    "[...document.querySelectorAll('.ai-messages .assistant')].map(x=>x.textContent).join(' | ')")
                check("AI 回复引导用户确认", "提案" in ai_text or "编辑" in ai_text, ai_text[-90:])
            except Exception as e:
                check("AI 对话触发生成编辑提案", False, str(e)[:100])
                print("     面板消息:",
                      page.evaluate("document.querySelector('#sera-msg')?.textContent"))

        sera_errs = [e for e in errors if "sera" in e.lower() or "edit_score" in e]
        check("无 Sera 相关页面错误", not sera_errs, sera_errs[:2])
        browser.close()

    print("\n结果:", "全部通过" if not failures else f"{len(failures)} 项失败: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
