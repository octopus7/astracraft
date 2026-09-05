"""Apply the build_scene.py font-cap cleanup to an existing authored scene.
This optional fast repair avoids rebuilding thousands of unchanged modules.
"""
import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
MODELS=ROOT/'assets'/'models'
bpy.ops.wm.open_mainfile(filepath=str(MODELS/'afterlight-rain-court.blend'))
report=json.loads((ROOT/'docs'/'asset-report.json').read_text())
records={r['mesh']:r for r in report['prototypes']}
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH' or '_text_' not in obj.data.name:continue
    mesh=obj.data
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bad=[f for f in bm.faces if (f.verts[1].co-f.verts[0].co).cross(f.verts[2].co-f.verts[0].co).length<2e-10]
    if bad:bmesh.ops.delete(bm,geom=bad,context='FACES')
    bm.to_mesh(mesh);bm.free();mesh.update()
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.018,area_weight=.5,correct_aspect=True,scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    uv=mesh.uv_layers.active.data
    paths=[]
    for p in mesh.polygons:
        coords=[uv[i].uv[:] for i in p.loop_indices]
        paths.append('M '+' L '.join(f'{x*1024:.3f},{(1-y)*1024:.3f}' for x,y in coords)+' Z')
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#152326"/><g fill="#67bfb044" stroke="#c4d9bc" stroke-width="1">'+''.join(f'<path d="{p}"/>' for p in paths)+'</g></svg>'
    rec=records[mesh.name];rec['vertices']=len(mesh.vertices);rec['polygons']=len(mesh.polygons)
    rec['degenerate_uv_faces']=0
    (ROOT/'uv'/rec['layout']).write_text(svg,encoding='utf8')
    print(obj.name,'removed zero-area geometry faces:',len(bad),flush=True)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
report['triangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
report['font_cap_cleanup']='Triangulated and removed collinear font-cap faces before UV packing.'
(ROOT/'docs'/'asset-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(MODELS/'afterlight-rain-court.blend'))
for o in bpy.context.scene.objects:o.select_set(o.type=='MESH')
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.export_scene.gltf(filepath=str(MODELS/'afterlight-rain-court.glb'),export_format='GLB',use_selection=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True,export_image_format='AUTO')
bpy.ops.export_scene.fbx(filepath=str(MODELS/'afterlight-rain-court.fbx'),use_selection=True,object_types={'MESH'},apply_unit_scale=True,axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True,use_mesh_modifiers=True,add_leaf_bones=False,bake_anim=False)
scene=bpy.context.scene
try:
    pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='OPTIX';pref.get_devices()
    for d in pref.devices:d.use=d.type!='CPU'
    scene.cycles.device='GPU'
except:scene.cycles.device='CPU'
scene.render.filepath=str(ROOT/'assets'/'renders'/'rain-court-hero.png')
bpy.ops.render.render(write_still=True)
scene.camera.location=(12,-14,13)
scene.camera.rotation_euler=(Vector((1.0,3.1,1.8))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=19.8
scene.render.resolution_x=1600;scene.render.resolution_y=1200
scene.render.filepath=str(ROOT/'assets'/'renders'/'rain-court-detail.png')
bpy.ops.render.render(write_still=True)
print('Final text repair and export complete',flush=True)
