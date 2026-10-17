from pathlib import Path
import json,subprocess
import imageio_ffmpeg,pymupdf
root=Path('D:/codex/CAE课程复现'); out=root/'02_课程核对';src=Path('D:/百度云盘下载/CAE课程')
ff=imageio_ffmpeg.get_ffmpeg_exe()
for v in json.loads((out/'视频清单.json').read_text(encoding='utf-8')):
    label=v['file'][:4];folder=out/label/'视频索引';folder.mkdir(parents=True,exist_ok=True)
    frames=[]
    for i in range(12):
        sec=int(v['seconds']*(i+.5)/12);p=folder/('%05ds.jpg'%sec)
        if not p.exists():subprocess.run([ff,'-hide_banner','-loglevel','error','-ss',str(sec),'-i',str(src/v['file']),'-frames:v','1','-vf','scale=960:-2','-q:v','3','-y',str(p)],check=True)
        frames.append((sec,p))
    doc=pymupdf.open()
    page=doc.new_page(width=1440,height=4*310)
    for i,(sec,p) in enumerate(frames):
        x=(i%3)*480;y=(i//3)*310
        page.insert_text((x+8,y+18),'%s  %02d:%02d'%(label,sec//60,sec%60),fontname='china-s',fontsize=13)
        page.insert_image(pymupdf.Rect(x,y+25,x+480,y+295),filename=str(p))
    page.get_pixmap().save(str(folder/'contact_sheet.png'))
    (folder/'frames.json').write_text(json.dumps([{'second':s,'path':str(p)} for s,p in frames],ensure_ascii=False,indent=2),encoding='utf-8')
    print(label,flush=True)