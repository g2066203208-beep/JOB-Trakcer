from pathlib import Path
from collections import Counter
import zipfile,json,hashlib
root=Path('D:/codex/CAE课程复现')
records=[]
for archive in sorted((root/'01_课程原始工程').rglob('*.wbpz')):
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        record={'lesson_archive':archive.name,'path':str(archive),'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),'files':len([n for n in names if not n.endswith('/')]),'extensions':dict(Counter(Path(n).suffix.lower() for n in names if not n.endswith('/'))),'projects':[n for n in names if n.endswith('.wbpj')],'geometry':[n for n in names if n.endswith(('.scdoc','.agdb','.step','.stp','.x_t'))],'result_files':[n for n in names if n.endswith(('.rst','.rth','.odb'))],'status':'archive inventoried; lesson not reproduced'}
        records.append(record)
        if archive.stem=='第01节':
            dest=root/'02_课程核对'/'第01节';dest.mkdir(parents=True,exist_ok=True)
            for name in names:
                if name.endswith(('.wbpj','.wbjn')):
                    (dest/Path(name).name).write_bytes(z.read(name))
(root/'课程工程清单.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
for r in records:print(json.dumps({k:r[k] for k in ['lesson_archive','files','extensions','projects','result_files']},ensure_ascii=False))
