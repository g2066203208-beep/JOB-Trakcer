from pathlib import Path
import subprocess,re,json
import imageio_ffmpeg
from pypdf import PdfReader
import pymupdf
root=Path('D:/codex/CAE课程复现');src=Path('D:/百度云盘下载/CAE课程')
out=root/'02_课程核对';out.mkdir(exist_ok=True)
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
videos=[]
for path in sorted(src.glob('*.mp4')):
    proc=subprocess.run([ffmpeg,'-hide_banner','-i',str(path)],capture_output=True,encoding='utf-8',errors='replace')
    m=re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)',proc.stderr)
    videos.append({'file':path.name,'seconds':int(m[1])*3600+int(m[2])*60+float(m[3]) if m else None,'probe':proc.stderr})
(out/'视频清单.json').write_text(json.dumps(videos,ensure_ascii=False,indent=2),encoding='utf-8')
notes=[]
for path in sorted(src.parent.glob('第*笔记*.pdf')):
    reader=PdfReader(path)
    pages=[p.extract_text() or '' for p in reader.pages]
    (out/(path.stem+'.txt')).write_text('\n\n'.join(pages),encoding='utf-8')
    notes.append({'file':path.name,'pages':len(pages),'characters':sum(map(len,pages))})
    if path.name.startswith('第01节'):
        doc=pymupdf.open(path)
        for i in range(min(2,len(doc))):doc[i].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(str(out/'第01节'/('笔记_p%d.png'%(i+1))))
(out/'笔记清单.json').write_text(json.dumps(notes,ensure_ascii=False,indent=2),encoding='utf-8')
first=sorted(src.glob('第01节*.mp4'))[0]
duration=videos[0]['seconds']
for sec in [120,600,1200,1800]:
    if duration and sec<duration:
        target=out/'第01节'/('视频_%04ds.png'%sec)
        subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-ss',str(sec),'-i',str(first),'-frames:v','1','-y',str(target)],check=True)
print(json.dumps({'videos':[{'file':v['file'],'minutes':round(v['seconds']/60,1) if v['seconds'] else None} for v in videos],'total_hours':sum(v['seconds'] or 0 for v in videos)/3600,'notes':notes},ensure_ascii=False,indent=2))
