import fs from "node:fs";
import assert from "node:assert/strict";
for(const p of ["index.html","styles.css","app.js","README.md","manifest.schema.json"])assert.ok(fs.existsSync(p),"missing "+p);
const html=fs.readFileSync("index.html","utf8"),app=fs.readFileSync("app.js","utf8"),readme=fs.readFileSync("README.md","utf8");
for(const s of ["立绘骨骼素材工作室","开始 ML 拆解","导出 rig-manifest.json","可动画素材"])assert.ok(html.includes(s),"missing html "+s);
for(const s of ["Xenova/modnet","PoseLandmarker","buildRig","buildLayers","rig-manifest.json","fallbackPose","destination-in"])assert.ok(app.includes(s),"missing app "+s);
assert.ok(readme.includes("专用动漫角色部件"),"missing model roadmap");
console.log("Character Rig Forge static checks: PASS");
