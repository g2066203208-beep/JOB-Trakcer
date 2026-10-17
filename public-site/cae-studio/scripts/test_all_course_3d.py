from pathlib import Path
import json
from playwright.sync_api import sync_playwright
site=Path('D:/codex/cae-portfolio-publish/public-site/cae-studio')
out=Path('D:/codex/CAE课程复现/04_网站验收')
catalog=json.loads((site/'results/catalog.json').read_text(encoding='utf8'))
report=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='D:/EngineeringAI/browsers/chromium-1234/chrome-win64/chrome.exe',headless=True,args=['--enable-unsafe-swiftshader'])
 for item in catalog:
  page=browser.new_page(viewport={'width':1440,'height':1000})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8770/cae-studio/result.html?case='+item['id'])
  page.wait_for_function('document.querySelector("#state").textContent.includes("已读取") || document.querySelector("#state").textContent.includes("失败")',timeout=60000)
  state=page.locator('#state').inner_text()
  assert '已读取' in state,(item['id'],state)
  assert page.locator('canvas').count()==1
  if item['analysis']=='modal':
   before=page.locator('canvas').screenshot()
   phase=page.locator('.field-canvas').get_attribute('data-phase')
   page.get_by_role('button',name='振型动画').click()
   page.wait_for_function('(p)=>document.querySelector(".field-canvas").dataset.phase!==p',arg=phase)
   page.get_by_role('button',name='暂停').click()
   assert before!=page.locator('canvas').screenshot(),'Modal image did not change'
  elif item['frames']>1:
   frame=page.locator('.field-canvas').get_attribute('data-result-frame')
   page.get_by_role('button',name='逐帧播放').click()
   page.wait_for_function('(f)=>document.querySelector(".field-canvas").dataset.resultFrame!==f',arg=frame)
   page.get_by_role('button',name='暂停').click()
  else: assert page.get_by_role('button',name='逐帧播放').is_disabled()
  assert not errors,errors
  page.screenshot(path=str(out/(item['id']+'-3d.png')))
  row={'id':item['id'],'loaded':True,'animation_checked':item['analysis']=='modal' or item['frames']>1,'errors':errors}
  report.append(row);print(json.dumps(row),flush=True)
  page.close()
 browser.close()
(out/'all-3d-browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
