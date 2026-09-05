"""Package editable sources preserving relative paths; excludes caches and logs."""
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
files=[root/'assets/models/afterlight-rain-court.blend']
for folder in ['assets/textures','source','uv','docs']:
 files.extend(p for p in (root/folder).rglob('*') if p.is_file() and p.suffix not in ['.log','.pyc','.blend1'] and '__pycache__' not in p.parts)
out=root/'assets/afterlight-source-kit.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(set(files)):z.write(p,p.relative_to(root))
with zipfile.ZipFile(out) as z:assert z.testzip() is None
assert out.stat().st_size<25*1024*1024, 'Archive exceeds Pages file size limit'
print(out.name,out.stat().st_size,'bytes;',len(files),'files')
