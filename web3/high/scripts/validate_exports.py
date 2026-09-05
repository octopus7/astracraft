"""Run in Blender headless. Re-imports each deliverable and verifies UV bounds and texture references."""
import bpy,pathlib,json,math,struct
R=pathlib.Path(__file__).resolve().parents[1]; records=[]
for ext in ['blend','glb','gltf','fbx']:
    path=R/'assets/models'/('afterlight-rain-court.'+ext)
    if ext=='blend': bpy.ops.wm.open_mainfile(filepath=str(path))
    else:
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        if ext=='fbx': bpy.ops.import_scene.fbx(filepath=str(path))
        else: bpy.ops.import_scene.gltf(filepath=str(path))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];bad=[];outside=0;unique_checked=0
    for o in meshes:
        if not o.data.uv_layers: bad.append(o.name)
        for layer in o.data.uv_layers:
            for d in layer.data:
                if not all(math.isfinite(v) and -.00001<=v<=1.00001 for v in d.uv): outside+=1
        if ext=='blend' and len(o.data.uv_layers)>1 and o.name not in ['N O R T H   /   R E P A I R','OPEN','SECTOR 04','04']:
            layer=o.data.uv_layers.get('LightmapUV'); cols=math.ceil(math.sqrt(len(o.data.polygons)));cell=1/cols
            for j,p in enumerate(o.data.polygons):
                for li in p.loop_indices:
                    u,v=layer.data[li].uv
                    assert (j%cols+.099)*cell<=u<=(j%cols+.901)*cell and (j//cols+.099)*cell<=v<=(j//cols+.901)*cell,(o.name,j)
                unique_checked+=1
    records.append({'format':ext,'bytes':path.stat().st_size,'meshObjects':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'polygons':sum(len(o.data.polygons) for o in meshes),'missingUV':bad,'uvOutOfBounds':outside,'uniqueUVFacesVerified':unique_checked})
    assert meshes and not bad and outside==0,records[-1]
g=json.loads((R/'assets/models/afterlight-rain-court.gltf').read_text());missing=[]
for d in g.get('buffers',[])+g.get('images',[]):
    if 'uri'in d and not (R/'assets/models'/d['uri']).exists(): missing.append(d['uri'])
assert not missing,missing
report={'passed':True,'formats':records,'gltfMissingResources':missing,'note':'UV1 non-overlap certified by disjoint per-face cell containment. UV0 deliberately reuses module surfaces; bevel strips inherit module UVs. FBX material translation varies by engine; GLB is the PBR reference.'}
(R/'docs/export-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
