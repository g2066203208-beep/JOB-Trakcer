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
const pageErrors=[];
const criticalHttpErrors=[];
page.on("pageerror",err=>pageErrors.push(String(err)));
page.on("response",res=>{
  if(res.status()<400)return;
  const url=res.url().split("?")[0];
  if(/\.(?:html|js|mjs|css)$/.test(url))criticalHttpErrors.push(res.status()+" "+url);
});

await page.goto("http://127.0.0.1:8080/character-skeleton-studio/",{waitUntil:"networkidle"});
await page.waitForFunction(()=>window.CharacterSkeletonStudio?.getBoneLengths);

const expected={
  leftUpperArm:139,
  leftForearm:145,
  rightUpperArm:139,
  rightForearm:145,
  leftThigh:216,
  leftShin:242,
  rightThigh:216,
  rightShin:242
};

async function assertRigidLengths(label){
  const lengths=await page.evaluate(()=>window.CharacterSkeletonStudio.getBoneLengths());
  for(const [key,target] of Object.entries(expected)){
    assert.ok(Math.abs(lengths[key]-target)<0.05,`${label}: ${key} changed to ${lengths[key]} (expected ${target})`);
  }
}
async function dragJoint(id,dx,dy){
  const handle=page.locator(`.joint-handle[data-joint="${id}"]`);
  const box=await handle.boundingBox();
  assert.ok(box,`${id} handle missing`);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+dx,y+dy,{steps:8});
  await page.mouse.up();
}

const baseline=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
await assertRigidLengths("initial");

const beforeWrist=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
await dragJoint("lw",95,-45);
const afterWrist=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
assert.notDeepEqual(afterWrist.lw,beforeWrist.lw,"IK wrist target must move");
assert.notDeepEqual(afterWrist.le,beforeWrist.le,"IK wrist drag must solve elbow");
await assertRigidLengths("left wrist IK");

const beforeAnkle=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
await dragJoint("ra",-100,-135);
const afterAnkle=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
assert.notDeepEqual(afterAnkle.ra,beforeAnkle.ra,"IK ankle target must move");
assert.notDeepEqual(afterAnkle.rk,beforeAnkle.rk,"IK ankle drag must solve knee");
await assertRigidLengths("right ankle IK");

const beforeElbow=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
await dragJoint("le",55,-30);
const afterElbow=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
assert.notDeepEqual(afterElbow.le,beforeElbow.le,"FK elbow drag must rotate upper arm");
assert.notDeepEqual(afterElbow.lw,beforeElbow.lw,"FK elbow drag must carry forearm/hand");
await assertRigidLengths("left elbow FK");

const beforeBody=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
await dragJoint("neck",30,22);
const afterBody=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
for(const id of ["head","neck","ls","rs","lh","rh","le","lw","rk","ra"]){
  assert.ok(Math.abs((afterBody[id].x-beforeBody[id].x)-30)<1.5,`body rigid translation x failed for ${id}`);
  assert.ok(Math.abs((afterBody[id].y-beforeBody[id].y)-22)<1.5,`body rigid translation y failed for ${id}`);
}
await assertRigidLengths("rigid body translation");

const handles=await page.locator(".joint-handle").count();
assert.equal(handles,14,"all 14 draggable joints must remain present");
const lengthRows=await page.locator("#lengthList .length-item").count();
assert.equal(lengthRows,8,"live length panel should contain 8 rigid limb segments");
const lockLabels=await page.locator("#lengthList .length-item em").allTextContents();
assert.equal(lockLabels.length,8);
assert.ok(lockLabels.every(v=>v==="LOCK"),"every measured limb must remain locked");

await page.click("#resetBtn");
const reset=await page.evaluate(()=>window.CharacterSkeletonStudio.getPose());
assert.deepEqual(reset,baseline,"reset must restore measured rigid pose");
await assertRigidLengths("reset");

assert.deepEqual(pageErrors,[],"page errors: "+pageErrors.join("\n"));
assert.deepEqual(criticalHttpErrors,[],"critical HTTP errors: "+criticalHttpErrors.join("\n"));
await browser.close();
console.log("CHARACTER_SKELETON_RIGID_IK_BROWSER_PASS");
