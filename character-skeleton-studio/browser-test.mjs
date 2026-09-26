import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const chrome=process.env.CHROME_PATH;
assert.ok(chrome,"CHROME_PATH missing");

const browser=await chromium.launch({
  executablePath:chrome,
  headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage"]
});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];
page.on("pageerror",err=>errors.push(String(err)));
page.on("console",msg=>{if(msg.type()==="error")errors.push(msg.text())});

await page.goto("http://127.0.0.1:8080/character-skeleton-studio/",{waitUntil:"networkidle"});
await page.waitForFunction(()=>window.CharacterSkeletonStudio?.getPose);

const before=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose().le);
const handle=page.locator('.joint-handle[data-joint="le"]');
const box=await handle.boundingBox();
assert.ok(box,"left elbow handle missing");

await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
await page.mouse.down();
await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+24,{steps:6});
await page.mouse.up();

const after=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose().le);
assert.notEqual(after.x,before.x,"drag must change elbow x");
assert.notEqual(after.y,before.y,"drag must change elbow y");

const selected=await page.locator("#selectedName").textContent();
assert.equal(selected,"左肘");

const lengths=await page.locator("#lengthList .length-item").count();
assert.equal(lengths,8,"live length panel should contain 8 limb segments");

const handles=await page.locator(".joint-handle").count();
assert.equal(handles,14,"all 14 draggable joints must be present");

const shapes=await page.locator("#skeletonLayer .bone").count();
assert.ok(shapes>=9,"bone rectangles missing");

await page.click("#resetBtn");
const reset=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose().le);
assert.deepEqual(reset,{x:-95,y:297},"reset must restore measured pose");

assert.deepEqual(errors,[],"browser console/page errors: "+errors.join("\n"));
await browser.close();
console.log("CHARACTER_SKELETON_BROWSER_PASS");
