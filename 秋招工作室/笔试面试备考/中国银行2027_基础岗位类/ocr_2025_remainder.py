#!/usr/bin/env python3
"""Extract last 19 pages of the 2025 uploaded practice scan for an accurately sourced study script."""
import pathlib, subprocess, re, fitz
root=pathlib.Path("秋招工作室/笔试面试备考/中国银行2027_基础岗位类/历年试题资料/2025")
files=sorted(root.glob("2025_便携扫描版_第*.pdf"))
assert len(files)==5,files
out=root/"2025_练习卷原PDF第30至48页_中文OCR待核.md"
lines=["# 2025招聘笔试练习卷原PDF第30-48页文字识别（待与画面对照）","","> 注：识别文本可能丢字、错字，尤其是计算式、几何图形、图表和四选项，不能当作准确原题。",""]
n=0
for fn in files:
 doc=fitz.open(fn)
 for i,page in enumerate(doc):
  n+=1
  if n<30:continue
  if n>48:break
  pix=page.get_pixmap(matrix=fitz.Matrix(2.5,2.5),alpha=False)
  proc=subprocess.run(["tesseract","stdin","stdout","-l","chi_sim+eng","--psm","3"],input=pix.tobytes("png"),capture_output=True,timeout=120)
  t=proc.stdout.decode("utf-8",errors="replace").strip()
  lines.append(f"\n## 原PDF第{n}页（{fn.name}，内部第{i+1}页）\n")
  lines.append(t)
  print("done",n,len(t),flush=True)
 if n>=48:break
out.write_text("\n\n".join(lines),encoding="utf-8")
print("SAVED",out,out.stat().st_size)