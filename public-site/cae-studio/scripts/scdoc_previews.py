from pathlib import Path
import zipfile,json
root=Path('D:/codex/cae_courses/lesson02');out=root/'geometry_previews';out.mkdir(exist_ok=True)
for p in root.rglob('*.scdoc'):
    try:
        with zipfile.ZipFile(p) as z:
            names=z.namelist();images=[n for n in names if n.lower().endswith(('.png','.jpg','.jpeg','.bmp'))]
            print(p.name,images[:12])
            for i,n in enumerate(images[:3]):(out/(p.stem+'_'+str(i)+Path(n).suffix)).write_bytes(z.read(n))
            xml=[n for n in names if n.endswith('.xml')]
            for n in xml:
                if 'document' in n.lower():
                    (out/(p.stem+'_document.xml')).write_bytes(z.read(n));break
    except Exception as e:print(type(e).__name__,e)