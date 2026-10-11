import pathlib, json
from playwright.sync_api import sync_playwright

CHROME = 'C:/Users/mail/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
base = pathlib.Path(__file__).resolve().parent.parent
css = (base / 'dist' / 'workspace-ai.css').as_uri()

html = f"""<!doctype html><html><head><style>{pathlib.Path('C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统/dist/workspace-ai.css').read_text(encoding='utf-8')}</style></head><body style="margin:0;background:#caa">
  <div style="width:340px;padding:8px;box-sizing:border-box">
    <section class="ai-search-card">
      <strong>曲库里暂未找到</strong>
      <p>所需作品</p>
      <button type="button">联网找谱</button>
      <a href="#">用音视频链接转谱</a>
    </section>
  </div>
</body></html>"""

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 380, 'height': 800})
    page.set_content(html)
    page.wait_for_timeout(300)

    def measure(sel):
        return page.evaluate("""(sel) => {
          const el = document.querySelector(sel);
          const cs = getComputedStyle(el);
          return {sel, sw: el.scrollWidth, cw: el.clientWidth, overflow: el.scrollWidth > el.clientWidth + 1, txt: el.textContent.trim(),
                  css_display: cs.display, css_white_space: cs.whiteSpace, css_max_w: cs.maxWidth, css_overflow: cs.overflow, css_flex: cs.flex,
                  rect_w: el.getBoundingClientRect().width};
        }""", sel)

    data = {
        'card': measure('.ai-search-card'),
        'btn': measure('.ai-search-card button'),
        'link': measure('.ai-search-card a'),
    }
    print(json.dumps(data, ensure_ascii=False, indent=2))
    page.screenshot(path=str(base / 'scripts' / '_probe_searchcard.png'), full_page=True)
    browser.close()
