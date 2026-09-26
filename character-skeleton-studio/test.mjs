import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("./studio.css",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("./studio.js",import.meta.url),"utf8");

assert.match(html,/id="skeletonSvg"/);
assert.match(html,/id="jointLayer"/);
assert.match(js,/headDiameter:224/);
assert.match(js,/neckWidth:36/);
assert.match(js,/neckHeight:34/);
assert.match(js,/shoulderWidth:120/);
assert.match(js,/torsoHeight:276/);
assert.match(js,/upperArm:139/);
assert.match(js,/forearm:145/);
assert.match(js,/thigh:216/);
assert.match(js,/shin:242/);
assert.match(js,/handWidth:100/);
assert.match(js,/handHeight:104/);
assert.match(js,/footWidth:74/);
assert.match(js,/footHeight:91/);
assert.match(js,/pointerdown/);
assert.match(js,/pointermove/);
assert.match(js,/setPointerCapture/);
assert.match(js,/segmentRect\(points\.ls,points\.le/);
assert.match(js,/segmentRect\(points\.le,points\.lw/);
assert.match(js,/segmentRect\(points\.lh,points\.lk/);
assert.match(js,/segmentRect\(points\.lk,points\.la/);
assert.match(js,/window\.CharacterSkeletonStudio/);
assert.match(css,/touch-action:none/);

console.log("CHARACTER_SKELETON_STUDIO_PASS");
