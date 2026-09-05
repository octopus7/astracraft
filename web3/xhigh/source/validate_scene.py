"""Headless re-import, UV-area and prototype self-overlap audit.
Blender -b --factory-startup --python source/validate_scene.py
Reports actual measured results to docs/validation.json.
"""
import bpy,json,math,time
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
models=ROOT/'assets'/'models'
start=time.time()

def stats():
    obs=[o for o in bpy.context.scene.objects if o.type=='MESH']
    coords=[o.matrix_world@Vector(c) for o in obs for c in o.bound_box]
    return {'mesh_objects':len(obs),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in obs),'bounds_min':[round(min(c[i] for c in coords),4) for i in range(3)],'bounds_max':[round(max(c[i] for c in coords),4) for i in range(3)],'with_uv':sum(bool(o.data.uv_layers) for o in obs),'materials':len({m.material.name for o in obs for m in o.material_slots if m.material})}

def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def area(p):return abs(sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p))))*.5 if len(p)>=3 else 0
def intersection(subject, clip):
    # Sutherland-Hodgman clipping, counterclockwise clip triangle.
    if cross(*clip)<0:clip=list(reversed(clip))
    output=list(subject)
    for i in range(3):
        a,b=clip[i],clip[(i+1)%3]
        old=output;output=[]
        if not old:break
        p=old[-1];dp=cross(a,b,p)
        for q in old:
            dq=cross(a,b,q)
            if (dq>=0)!=(dp>=0):
                k=dp/(dp-dq)
                output.append((p[0]+k*(q[0]-p[0]),p[1]+k*(q[1]-p[1])))
            if dq>=0:output.append(q)
            p=q;dp=dq
    return area(output)

bpy.ops.wm.open_mainfile(filepath=str(models/'afterlight-rain-court.blend'))
report={'source':stats(),'uv':{'unique_meshes':0,'out_of_bounds_loops':0,'degenerate_uv_triangles':0,'overlapping_triangle_pairs':0,'overlap_area':0.0,'details':[]},'texture_images':[]}
for im in bpy.data.images:
    if im.source=='FILE':report['texture_images'].append({'name':im.name,'size':list(im.size),'packed':bool(im.packed_file),'colorspace':im.colorspace_settings.name})
meshes=set(o.data for o in bpy.context.scene.objects if o.type=='MESH')
for mesh in meshes:
    mesh.calc_loop_triangles()
    uv=mesh.uv_layers.active.data
    bounds=sum(any(v<-.00001 or v>1.00001 for v in d.uv) for d in uv)
    triangles=[]
    degenerates=0
    for t in mesh.loop_triangles:
        p=[tuple(uv[i].uv) for i in t.loops]
        if area(p)<1e-12:degenerates+=1;continue
        triangles.append((p,(min(x for x,y in p),min(y for x,y in p),max(x for x,y in p),max(y for x,y in p)),t.polygon_index))
    # Spatial bins avoid comparing distant packed UV islands.
    bins={};seen=set();overlaps=0;total=0.0
    for i,(p,b,face) in enumerate(triangles):
        cells=[(x,y) for x in range(int(b[0]*20),int(b[2]*20)+1) for y in range(int(b[1]*20),int(b[3]*20)+1)]
        candidates=set(j for cell in cells for j in bins.get(cell,[]))
        for j in candidates:
            q,c,other=triangles[j]
            if face==other:continue
            if min(b[2],c[2])-max(b[0],c[0])<1e-9 or min(b[3],c[3])-max(b[1],c[1])<1e-9:continue
            overlap=intersection(p,q)
            if overlap>1e-9:overlaps+=1;total+=overlap
        for cell in cells:bins.setdefault(cell,[]).append(i)
    report['uv']['unique_meshes']+=1
    report['uv']['out_of_bounds_loops']+=bounds
    report['uv']['degenerate_uv_triangles']+=degenerates
    report['uv']['overlapping_triangle_pairs']+=overlaps
    report['uv']['overlap_area']+=total
    if bounds or degenerates or overlaps:report['uv']['details'].append({'mesh':mesh.name,'outside':bounds,'degenerate':degenerates,'overlaps':overlaps,'area':total})
report['uv']['policy']='Overlap checked inside each unique prototype only. Modular instances deliberately share prototype UVs. Adjacent shared borders are not counted as overlap.'

# Render a checker inspection using exactly the source object's packed UV0.
checker=bpy.data.materials.new('UV inspection • numbered checker');checker.use_nodes=True
image=bpy.data.images.load(str(ROOT/'assets'/'textures'/'uv-checker.png'))
node=checker.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
p=checker.node_tree.nodes.get('Principled BSDF')
checker.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color'])
p.inputs['Roughness'].default_value=.85
for ob in bpy.context.scene.objects:
    if ob.type=='MESH':
        for slot in ob.material_slots:slot.link='OBJECT';slot.material=checker
scene=bpy.context.scene
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.cycles.samples=16
try:
    pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='OPTIX';pref.get_devices()
    for d in pref.devices:d.use=d.type!='CPU'
    scene.cycles.device='GPU'
except:scene.cycles.device='CPU'
scene.render.filepath=str(ROOT/'uv'/'checker-inspection.png')
bpy.ops.render.render(write_still=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(models/'afterlight-rain-court.glb'))
report['glb_reimport']=stats()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(models/'afterlight-rain-court.fbx'))
report['fbx_reimport']=stats()
report['file_sizes']={p.name:p.stat().st_size for p in models.iterdir() if p.suffix in ['.glb','.fbx','.blend']}
report['checks']={
 'glb_mesh_count_matches':report['glb_reimport']['mesh_objects']==report['source']['mesh_objects'],
 'fbx_mesh_count_matches':report['fbx_reimport']['mesh_objects']==report['source']['mesh_objects'],
 'glb_triangle_count_matches':report['glb_reimport']['triangles']==report['source']['triangles'],
 'fbx_triangle_count_matches':report['fbx_reimport']['triangles']==report['source']['triangles'],
 'glb_every_mesh_has_uv':report['glb_reimport']['mesh_objects']==report['glb_reimport']['with_uv'],
 'fbx_every_mesh_has_uv':report['fbx_reimport']['mesh_objects']==report['fbx_reimport']['with_uv'],
 'uv_within_unit_square':report['uv']['out_of_bounds_loops']==0,
 'no_unintended_uv_overlap':report['uv']['overlapping_triangle_pairs']==0,
 'no_collapsed_uv_triangles':report['uv']['degenerate_uv_triangles']==0,
 'all_models_under_25_mib':all(s<25*1024*1024 for s in report['file_sizes'].values())
}
report['seconds']=round(time.time()-start,2)
(ROOT/'docs'/'validation.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2),flush=True)
if not all(report['checks'].values()):raise RuntimeError('Validation failed; see docs/validation.json')
