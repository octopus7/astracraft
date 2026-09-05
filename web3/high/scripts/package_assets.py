import pathlib,zipfile,shutil,json
R=pathlib.Path(__file__).resolve().parents[1]
shutil.copyfile(R/'assets/renders/hero.png',R/'preview.png')
target=R/'assets/afterlight-source-kit.zip'
files=[]
for folder in ['scripts','uv','docs']:
    files.extend(p for p in (R/folder).rglob('*') if p.is_file() and p.suffix not in ['.log','.png'])
files.extend((R/'assets/models').glob('*.gltf'));files.extend((R/'assets/models').glob('*.bin'));files.extend((R/'assets/models').glob('*.png'))
files.extend([R/'uv/checker.png',R/'uv/checker-scene.png'])
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in files:z.write(p,p.relative_to(R).as_posix())
sizes=[]
for p in R.rglob('*'):
    if p.is_file() and p.suffix!='.blend1':
        assert p.stat().st_size<25*1024*1024,(p,p.stat().st_size)
        sizes.append({'file':p.relative_to(R).as_posix(),'bytes':p.stat().st_size})
(R/'docs/file-sizes.json').write_text(json.dumps({'under25MiB':True,'files':sizes},indent=2))
print('SOURCE_KIT',target.stat().st_size,'bytes;',len(sizes),'files all below 25 MiB')
