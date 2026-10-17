from pathlib import Path
import json
from playwright.sync_api import sync_playwright
out=Path('D:/codex/CAE课程复现/04_网站验收');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='D:/EngineeringAI/browsers/chromium-1234/chrome-win64/chrome.exe',headless=True,args=['--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8770/cae-studio/',wait_until='networkidle')
 assert page.locator('.case-card').count()==13
 page.evaluate('document.querySelectorAll("img").forEach(i=>i.loading="eager")')
 page.wait_for_function('Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)')
 page.screenshot(path=str(out/'desktop.png'),full_page=True)
 page.get_by_role('button',name='接触与连接',exact=True).click()
 assert page.locator('.case-card').count()==2
 page.locator('[data-case="lesson07"]').click()
 assert page.locator('#detail').is_visible()
 page.get_by_role('button',name='展开详细操作记录').click()
 page.wait_for_function('document.querySelector("#guide-content").textContent.includes("法兰")')
 page.screenshot(path=str(out/'lesson07-detail.png'))
 page.keyboard.press('Escape');assert not page.locator('#detail').is_visible()
 page.get_by_role('button',name='全部',exact=True).click()
 page.set_viewport_size({'width':390,'height':844})
 page.goto('http://127.0.0.1:8770/cae-studio/',wait_until='networkidle')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(out/'mobile.png'),full_page=True)
 assert not errors,errors
 (out/'browser-report.json').write_text(json.dumps({'cards':13,'filter':'passed','case_dialog':'passed','guide_fetch':'passed','escape_close':'passed','images':'all_loaded','mobile_overflow':False,'page_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
 browser.close()
print('PASS: desktop/mobile, 13 cases, filters, detail, guide, images, Escape')