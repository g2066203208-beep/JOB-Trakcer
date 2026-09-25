import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text())});

await page.goto('http://127.0.0.1:8000/character-live2d-lab/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__live2dStats?.ready,{timeout:30000});
const stats=await page.evaluate(()=>window.__live2dStats);
const canvas=await page.$eval('#glcanvas',el=>({w:el.width,h:el.height,rect:el.getBoundingClientRect().toJSON?.()||{width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}})).catch(()=>null);
const dropHidden=await page.$eval('#drop',el=>el.classList.contains('hidden')).catch(()=>false);

function assert(cond,msg){if(!cond)throw new Error(msg)}
assert(stats.layers>=12,'too few rig layers '+JSON.stringify(stats));
assert(stats.hairStrands>=2,'hair physics not initialized '+JSON.stringify(stats));
assert(stats.anchors.eyeL&&stats.anchors.eyeR,'eye anchors missing '+JSON.stringify(stats));
assert(stats.anchors.mouth,'mouth anchor missing '+JSON.stringify(stats));
assert(stats.anchors.neck&&stats.anchors.body,'body anchors missing '+JSON.stringify(stats));
assert(canvas&&canvas.w>0&&canvas.h>0,'WebGL canvas missing '+JSON.stringify(canvas));
assert(dropHidden,'auto-loaded PSD did not hide drop zone');
assert(!errors.length,'browser errors: '+errors.join(' | '));

console.log(JSON.stringify({ok:true,stats,canvas},null,2));
await page.screenshot({path:'live2d-smoke.png',fullPage:true});
await browser.close();
