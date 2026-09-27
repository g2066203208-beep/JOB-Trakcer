import { chromium } from "playwright";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const base = "http://127.0.0.1:4173/";
const imagePath = "/tmp/test-character.png";
const outDir = "artifacts/rig-forge-demo";
await fs.mkdir(outDir, { recursive:true });

if (!existsSync(imagePath)) throw new Error("test image missing: " + imagePath);

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1440, height:1000 }, deviceScaleFactor:1 });

page.on("console", msg => { if(msg.type()==="error") console.error("[page]", msg.text()); });
page.on("pageerror", err => console.error("[pageerror]", err));

await page.goto(base, { waitUntil:"networkidle", timeout:120000 });
await page.setInputFiles("#fileInput", imagePath);
await page.click("#analyzeBtn");
await page.waitForFunction(() => document.querySelector("#progressText")?.textContent === "4 / 4", null, {timeout:600000});

const before = await page.evaluate(() => window.CharacterRigForge?.getManifest?.());
if (!before) throw new Error("Rig manifest not exposed after base analysis");

await page.click("#samBtn");
await page.waitForFunction(
  () => document.querySelector("#modelStatus")?.textContent?.includes("SAM3 智能拆层完成"),
  null,
  {timeout:900000}
);

const manifest = await page.evaluate(() => window.CharacterRigForge.getManifest());
const layers = await page.evaluate(() => window.CharacterRigForge.getLayerData());

await fs.writeFile(outDir + "/rig-manifest.json", JSON.stringify(manifest,null,2));
for (const [id, bytes] of Object.entries(layers)) {
  await fs.writeFile(outDir + "/" + id + ".png", Buffer.from(bytes));
}
await page.locator("#canvasFrame").screenshot({path:outDir + "/preview.png"});
await fs.writeFile(outDir + "/source-name.txt", "OpenClipart test asset #171797\n");

await browser.close();
console.log("E2E export complete:", Object.keys(layers).length, "layers");
