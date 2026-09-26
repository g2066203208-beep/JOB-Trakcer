import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("./studio.css",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("./studio.js",import.meta.url),"utf8");

assert.match(html,/id="skeletonSvg"/);
assert.match(html,/骨长锁定/);
assert.match(html,/2-Bone IK/);
assert.match(js,/headDiameter:224/);
assert.match(js,/upperArm:139/);
assert.match(js,/forearm:145/);
assert.match(js,/thigh:216/);
assert.match(js,/shin:242/);
assert.match(js,/const RIGID_CHAINS=/);
assert.match(js,/function solveTwoBone/);
assert.match(js,/function rotateRigidSubchain/);
assert.match(js,/function translateWholeSkeleton/);
assert.match(js,/function minReachForFlex/);
assert.match(js,/CHAIN_BY_END/);
assert.match(js,/CHAIN_BY_MID/);
assert.match(js,/getBoneLengths/);
assert.match(js,/dragState\.textContent=chain\?"IK":"RIGID"/);
assert.doesNotMatch(js,/points\[dragging\]\.x\s*=/);
assert.doesNotMatch(js,/points\[dragging\]\.y\s*=/);
assert.match(js,/segmentRect\(points\.ls,points\.le/);
assert.match(js,/segmentRect\(points\.le,points\.lw/);
assert.match(js,/segmentRect\(points\.lh,points\.lk/);
assert.match(js,/segmentRect\(points\.lk,points\.la/);
assert.match(js,/window\.CharacterSkeletonStudio/);
assert.match(css,/touch-action:none/);
assert.match(css,/\.length-item em/);

console.log("CHARACTER_SKELETON_RIGID_IK_STATIC_PASS");
