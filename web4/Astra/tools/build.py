"""Blender 4.5: build Astra geometry, pack ImageGen textures and export GLBs."""
from pathlib import Path
import bpy, math, random, numpy as np
ROOT=Path(__file__).resolve().parents[1]
base=ROOT.parent/'Sol/tools/build_village.py'
# Reuse primitive helpers, never execute Sol's build or modify its output.
source=base.read_text(encoding='utf-8').split('\nsetup_blender_scene()\n')[0]
exec(compile(source,str(base),'exec'))
random.seed(94)
bpy.context.preferences.filepaths.save_version=0
texdir=ROOT/'assets/textures'
atlas=bpy.data.images.load(str(texdir/'imagegen-atlas.png'))
w,h=atlas.size; pixels=np.empty(w*h*4,np.float32); atlas.pixels.foreach_get(pixels); pixels=pixels.reshape(h,w,4)
images={}
for name,x,y in [('wood',0,1),('roof',1,1),('plaster',0,0),('grass',1,0)]:
    arr=pixels[y*(h//2):(y+1)*(h//2),x*(w//2):(x+1)*(w//2)].copy()
    im=bpy.data.images.new(name,width=w//2,height=h//2); im.pixels.foreach_set(arr.ravel()); im.filepath_raw=str(texdir/f'{name}.png'); im.file_format='PNG'; im.save(); im.pack(); images[name]=im
    gray=arr[:,:,:3].mean(axis=2); gy,gx=np.gradient(gray)
    normal=np.dstack((-gx*2,-gy*2,np.ones_like(gray))); normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    for suffix,data in [('normal',np.dstack((normal*.5+.5,np.ones_like(gray)))),('roughness',np.dstack([np.clip(.65+gray*.2,0,1)]*3+[np.ones_like(gray)]))]:
        img=bpy.data.images.new(name+'-'+suffix,width=w//2,height=h//2); img.colorspace_settings.name='Non-Color'; img.pixels.foreach_set(data.astype(np.float32).ravel()); img.filepath_raw=str(texdir/f'{name}-{suffix}.png'); img.file_format='PNG'; img.save(); img.pack(); images[name+'-'+suffix]=img
# Explicit smooth intensity map plus repeatable wave/noise data texture.
n=512; yy,xx=np.mgrid[0:n,0:n]/(n-1)*2-1
r=np.sqrt(xx*xx+yy*yy); edge=.88+.035*np.sin(np.arctan2(yy,xx)*7)+.025*np.sin(xx*17+yy*9)
mask=np.clip((edge-r)/.2,0,1); mask=mask*mask*(3-2*mask)
wave=.5+.22*np.sin(xx*math.pi*8+np.sin(yy*math.pi*4))+.16*np.sin(yy*math.pi*12+xx*math.pi*4)
for name,a in [('shore-mask',mask),('wave-noise',wave)]:
    img=bpy.data.images.new(name,width=n,height=n); img.colorspace_settings.name='Non-Color'; data=np.dstack((a,a,a,np.ones_like(a))).astype(np.float32); img.pixels.foreach_set(data.ravel()); img.filepath_raw=str(texdir/f'{name}.png'); img.file_format='PNG'; img.save()
for key,mat in MATS.items():
    bs=mat.node_tree.nodes.get('Principled BSDF'); col=bs.inputs['Base Color'].default_value
    for i in range(3): col[i]=((col[i]+.055)/1.055)**2.4
    category='wood' if 'wood' in key else 'roof' if 'roof' in key else 'grass' if 'grass' in key else 'plaster' if key in ['plaster','cream'] else None
    if category:
        nodes=mat.node_tree.nodes; links=mat.node_tree.links
        albedo=nodes.new('ShaderNodeTexImage'); albedo.image=images[category]; links.new(albedo.outputs['Color'],bs.inputs['Base Color'])
        rough=nodes.new('ShaderNodeTexImage'); rough.image=images[category+'-roughness']; links.new(rough.outputs['Color'],bs.inputs['Roughness'])
        norm=nodes.new('ShaderNodeTexImage'); norm.image=images[category+'-normal']; convert=nodes.new('ShaderNodeNormalMap'); convert.inputs['Strength'].default_value=.3; links.new(norm.outputs['Color'],convert.inputs['Color']); links.new(convert.outputs['Normal'],bs.inputs['Normal'])
def tube(c,name,points,radius,mat):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.bevel_depth=radius; curve.bevel_resolution=2
    s=curve.splines.new('POLY'); s.points.add(len(points)-1)
    for p,co in zip(s.points,points):p.co=(*co,1)
    obj=bpy.data.objects.new(name,curve); c.objects.link(obj); obj.data.materials.append(mat); return obj
old_cottage=add_cottage
def add_cottage(c,detail):
    before=set(c.objects); old_cottage(c,detail)
    for obj in set(c.objects)-before: obj.location.y+=2.6
    for obj in list(c.objects):
        if obj.name.startswith(('Roof_','Door_Header','Door_Frame')): bpy.data.objects.remove(obj,do_unlink=True)
    for side in [-1,1]:
        for row in range(7 if detail else 3):
            t=(row+.5)/(7 if detail else 3); x=side*t*3.35; z=6.05-2.0*t+.4*t*t
            for k in range(10 if detail else 1):
                y=-.6+(k-4.5)*.55 if detail else -.6
                cube(c,f'Astra_Tile_{side}_{row}_{k}',(-4.5+x,y,z),(.58 if detail else 1.2,.62 if detail else 5.7,.15),MATS['roof_light' if k%3 else 'roof'],(0,side*math.atan((2-.8*t)/3.35),0),.08 if detail else .03)
        pts=[(-4.5+side*t*3.5,-3.55,6.1-2*t+.4*t*t) for t in np.linspace(0,1,24)]
        tube(c,'Curved_Gable_Trim',pts,.14,MATS['wood'])
    pts=[(-4.5+.79*math.cos(a),-3.08,2.35+.79*math.sin(a)) for a in np.linspace(0,math.pi,24)]
    tube(c,'Arched_Door_Frame',pts,.13,MATS['wood'])
    cylinder(c,'Round_Attic_Window',(-4.5,-3.22,4.65),.48,.1,MATS['glass'],32,(math.pi/2,0,0))
    tube(c,'Attic_Round_Frame',[(-4.5+.53*math.cos(a),-3.3,4.65+.53*math.sin(a)) for a in np.linspace(0,math.tau,40)],.08,MATS['wood'])
    for z in [.42,.56,.7]:cube(c,'Door_Step',(-4.5,-3.8+(z-.42)*2,z),(1.9,1,.18),MATS['stone_light'],bevel=.08)
old_bridge=add_bridge
def add_bridge(c,detail):
    old_bridge(c,detail)
    for obj in list(c.objects):
        if obj.name.startswith('Bridge_Rail'):bpy.data.objects.remove(obj,do_unlink=True)
    for side in [-1,1]:tube(c,'Continuous_Arched_Rail',[(2.2+(t-.5)*5.4,-2.35+side*1.05,1.88+math.sin(t*math.pi)*1.03) for t in np.linspace(0,1,40 if detail else 8)],.12,MATS['wood_light'])
old_tree=add_tree
def add_tree(c,detail,index,position,size=1):
    old_tree(c,detail,index,position,size)
    if detail:
        for i in range(95):
            a=random.random()*math.tau; z=random.uniform(-1,1); radius=math.sqrt(1-z*z)*1.9*size
            sphere(c,'Leaf_Cluster',(position[0]+math.cos(a)*radius,position[1]+math.sin(a)*radius,4.4*size+z*1.6*size),random.uniform(.2,.36),MATS['leaf_light' if i%3 else 'leaf'],1,(1,.7,.5))
old_plants=add_plants
def add_plants(c,detail):
    old_plants(c,detail)
    for i in range(220 if detail else 45):
        x=random.uniform(-9.5,9.5); y=random.uniform(-8.5,8.5)
        if x*x+y*y>95 or ((x+5.35)/4.3)**2+((y+6.25)/2.4)**2<1.2 or abs(x-2.3)<1.4 or (-8<x<-1 and -3.8<y<2.5):continue
        if i%3==0:
            h=random.uniform(.2,.5); tube(c,'Flower_Stem',[(x,y,.3),(x,y,.3+h)],.018,MATS['leaf'])
            for k in range(5):sphere(c,'Daisy_Petal',(x+.085*math.cos(k*math.tau/5),y+.085*math.sin(k*math.tau/5),.3+h),.08,MATS['white' if i%2 else 'pink'],1,(1,1,.45))
            sphere(c,'Daisy_Center',(x,y,.32+h),.055,MATS['yellow'],1)
        else:
            for k in range(3):tube(c,'Grass_Blade',[(x,y,.28),(x+.08*k,y+.04*k,.5+random.random()*.2)],.025,MATS['leaf_light'])
setup_blender_scene()
low=build_variant('ASTRA_LOW',False); detail=build_variant('ASTRA_DETAIL',True)
for c in [low,detail]:
    # Remove the cylinder overlay rim; shader wet soil supplies a continuous transition.
    for obj in list(c.objects):
        if obj.name.startswith('Puddle_Rim'):bpy.data.objects.remove(obj,do_unlink=True)
    # Export curves as meshes and generate UVs for all texture consumers.
    select_collection(c); bpy.context.view_layer.objects.active=next(iter(c.objects)); bpy.ops.object.convert(target='MESH')
    select_collection(c); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.025); bpy.ops.object.mode_set(mode='OBJECT')
low.hide_render=True
unique=bpy.data.materials.new('Cottage_Facade_Unique_One_To_One');unique.use_nodes=True
image=bpy.data.images.load(str(texdir/'cottage-facade-unique.png'));image.pack()
node=unique.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;node.extension='EXTEND'
unique.node_tree.links.new(node.outputs['Color'],unique.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
unique.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.85
for c in [low,detail]:
    wall=next(o for o in c.objects if o.name.startswith('Cottage_Walls'))
    wall.data.materials.append(unique);idx=len(wall.data.materials)-1
    uv=wall.data.uv_layers.active.data
    for face in wall.data.polygons:
        if face.normal.y < -.98:
            face.material_index=idx
            for li in face.loop_indices:
                co=wall.data.vertices[wall.data.loops[li].vertex_index].co
                uv[li].uv=((co.x+3)/6,(co.z+1.9)/3.8)
for o in low.objects:o.hide_set(True)
bpy.context.scene.camera.data.ortho_scale=27
bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_DIR/'cozy-village-source.blend'))
export_variant(low,'cozy-village-low.glb'); export_variant(detail,'cozy-village-detail.glb')
print('ASTRA BUILD COMPLETE',len(low.objects),len(detail.objects))
