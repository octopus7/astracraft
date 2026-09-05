"""Independent Blender reimport checks for portable exports."""
import bpy, json, math
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'assets'
report={}
for kind in ['glb','fbx']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 path=str(root/('rain-court.'+kind))
 if kind=='glb':bpy.ops.import_scene.gltf(filepath=path)
 else:bpy.ops.import_scene.fbx(filepath=path)
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 bad=[];uvcount=0;verts=0
 for o in meshes:
  verts+=len(o.data.vertices)
  if not o.data.uv_layers:bad.append(o.name+': missing UV')
  else:
   for t in o.data.uv_layers.active.data:
    uvcount+=1
    if not all(math.isfinite(v) and -.00001<=v<=1.00001 for v in t.uv):bad.append(o.name+': invalid UV');break
  if any(not all(math.isfinite(c) for c in v.co) for v in o.data.vertices):bad.append(o.name+': invalid position')
 images=[{'name':i.name,'width':i.size[0],'height':i.size[1]} for i in bpy.data.images if i.type=='IMAGE']
 if not any(i['width']>0 for i in images):bad.append('missing texture')
 report[kind]={'meshes':len(meshes),'vertices':verts,'uvLoops':uvcount,'images':images,'errors':bad}
 assert meshes and not bad,report[kind]
(root/'reimport-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
