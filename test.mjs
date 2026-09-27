import fs from "node:fs";
import assert from "node:assert/strict";
for(const p of ["index.html","styles.css","app.js","README.md","manifest.schema.json"])assert.ok(fs.existsSync(p),"missing "+p);
const html=fs.readFileSync("index.html","utf8"),app=fs.readFileSync("app.js","utf8"),readme=fs.readFileSync("README.md","utf8");
for(const s of ["立绘骨骼素材工作室","SAM3 智能拆层","语义拆层素材","导出 rig-manifest.json"])assert.ok(html.includes(s),"missing html "+s);
for(const s of ["onnx-community/BEN2-ONNX","Sam3TrackerModel","onnx-community/sam3-tracker-ONNX","PoseLandmarker","semanticPromptSet","input_boxes","zOrder","back-hair","front-hair","eye-L","eye-R","accessory","fallbackPose"])assert.ok(app.includes(s),"missing app "+s);
assert.ok((app.match(/\{id:"/g)||[]).length>=20,"semantic layer definitions missing");
assert.ok(readme.includes("See-through"),"missing research reference");
console.log("Character Rig Forge semantic decomposition checks: PASS");
