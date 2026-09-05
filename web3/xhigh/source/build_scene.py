"""AFTERLIGHT / The Rain Court. Blender 4.5, deterministic mesh authoring.

Usage: blender -b --python source/build_scene.py -- --render
Every geometry prototype receives packed, non-overlapping UV0 islands.
Linked module instances intentionally reuse their prototype's texture coordinates.
No live Blender session or third-party Blender add-on is used.
"""
import bpy, bmesh, math, random, json, sys, os, argparse, time
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets'
TEX = OUT / 'textures'
MODELS = OUT / 'models'
UV = ROOT / 'uv'
RNG = random.Random(1742)
START = time.time()
parser = argparse.ArgumentParser()
parser.add_argument('--render', action='store_true')
parser.add_argument('--preview', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
for p in [OUT, TEX, MODELS, UV, OUT/'renders']:
    p.mkdir(parents=True, exist_ok=True)
# Remove only this generator's prior UV layout output, so rebuilt prototypes
# cannot leave stale layouts with outdated numbered filenames.
for previous in UV.glob('UV_*.svg'):
    previous.unlink()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.materials):
    bpy.data.materials.remove(data)

scene = bpy.context.scene
scene.name = 'AFTERLIGHT • The Rain Court'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
collections = {}
def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    collections[name] = c
    return c
for n in ['01 Foundation & wet paving','02 Broken courtyard masonry','03 Repair shop','04 Industrial skyline','05 Pipes & ventilation','06 Salvage & crates','07 Service robots','08 Vegetation & debris','09 Practical lights','10 Cameras & studio']:
    collection(n)
active_collection = collections['01 Foundation & wet paving']

def in_collection(obj, name=None):
    c = collections[name] if name else active_collection
    for old in list(obj.users_collection): old.objects.unlink(obj)
    c.objects.link(obj)

def image_node(nodes, filename, space='sRGB'):
    image = bpy.data.images.load(str(TEX/filename), check_existing=True)
    image.colorspace_settings.name = space
    n = nodes.new('ShaderNodeTexImage')
    n.image = image
    n.interpolation = 'Linear'
    n.extension = 'REPEAT'
    return n

def material(name, color, rough=.6, metal=0, texture=None, emission=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    n = m.node_tree.nodes
    l = m.node_tree.links
    p = n.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if texture and (TEX/f'{texture}_basecolor.png').exists():
        tx = image_node(n, f'{texture}_basecolor.png')
        tx.location = (-620,220)
        l.new(tx.outputs['Color'], p.inputs['Base Color'])
        tx = image_node(n, f'{texture}_roughness.png', 'Non-Color')
        tx.location = (-620,-40)
        l.new(tx.outputs['Color'], p.inputs['Roughness'])
        tx = image_node(n, f'{texture}_normal.png', 'Non-Color')
        tx.location = (-620,-280)
        normal = n.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = .3 if texture=='masonry' else .45
        normal.location = (-290,-100)
        l.new(tx.outputs['Color'],normal.inputs['Color'])
        l.new(normal.outputs[0],p.inputs['Normal'])
    if emission:
        p.inputs['Emission Color'].default_value = (*color,1)
        p.inputs['Emission Strength'].default_value = emission
    return m

mats = {}
mats['stone'] = material('PBR • rain-darkened slate / ImageGen',(.26,.27,.24),texture='slate')
mats['brick'] = material('PBR • weathered brick / ImageGen',(.29,.26,.19),texture='masonry')
mats['brickwall'] = material('PBR • brick facade / ImageGen',(.29,.26,.19),texture='brickwall')
mats['teal'] = material('PBR • oxidised teal steel / ImageGen',(.045,.24,.23),metal=.7,texture='teal')
mats['wood'] = material('PBR • salvaged timber / ImageGen',(.22,.11,.05),texture='timber')
mats['edge'] = material('Concrete • aged limestone',(.32,.34,.29),.73)
mats['mortar'] = material('Mortar • humid charcoal',(.093,.106,.091),.93)
mats['metal'] = material('Steel • dark patina',(.062,.081,.079),.42,.78)
mats['rust'] = material('Steel • rust ochre',(.235,.095,.038),.62,.48)
mats['ochre'] = material('Paint • faded safety ochre',(.57,.31,.078),.43,.42)
mats['cream'] = material('Paint • weathered ivory',(.65,.62,.48),.48,.4)
mats['black'] = material('Rubber • joints and tyres',(.014,.021,.021),.73)
mats['glass'] = material('Glazing • soot and condensation',(.052,.10,.105),.19,.67)
mats['warm'] = material('Emission • tungsten 2400K',(1,.52,.17),.23,emission=4)
mats['cyan'] = material('Emission • mint signal',(.23,.95,.88),.21,emission=3.5)
mats['leaf'] = material('Foliage • olive',(.155,.20,.067),.9)
mats['leaf2'] = material('Foliage • dry copper',(.23,.24,.10),.85)
mats['soil'] = material('Soil • moss deposits',(.066,.085,.036),.94)
mats['water'] = material('PBR • shallow rainwater',(.035,.059,.060),.12,.63)
mats['water'].node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.45
mats['paper'] = material('Paper • soaked scraps',(.40,.39,.29),.92)

# A mesh is unwrapped exactly once, then shared by repeated physical modules.
mesh_cache = {}
uv_records = []
def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj

def unwrap(obj, key):
    activate(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.018, area_weight=.5, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.data.uv_layers.active.name='UV0_Packed'
    obj.data['uv_policy']='Non-overlapping prototype islands. Intentional reuse only between repeated modules.'
    obj.data['uv_padding_normalized']=.018
    obj.data.name=f'UV_{len(uv_records):03d}_{key[:60]}'
    uv_records.append(obj.data)

def finish(obj, name, loc, mat, key=None, bevel=0):
    obj.name=name
    in_collection(obj)
    if bevel:
        activate(obj)
        mod=obj.modifiers.new('Real edge bevels','BEVEL')
        mod.width=bevel
        mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if key is not None:
        unwrap(obj, key)
        mesh_cache[key]=obj.data
    obj.location=loc
    if len(obj.material_slots)==0: obj.data.materials.append(mats[mat])
    obj.material_slots[0].link='OBJECT'
    obj.material_slots[0].material=mats[mat]
    obj['asset_part']=name
    return obj

def instance(name, key, loc, mat):
    obj=bpy.data.objects.new(name,mesh_cache[key])
    active_collection.objects.link(obj)
    obj.location=loc
    obj.material_slots[0].link='OBJECT'
    obj.material_slots[0].material=mats[mat]
    return obj

def box(name, loc, dims, mat='metal', bevel=.025, rotation=None):
    dims=tuple(round(d,4) for d in dims)
    key=f'box_{dims}_{bevel}'
    if key in mesh_cache: obj=instance(name,key,loc,mat)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj=bpy.context.object
        obj.dimensions=dims
        activate(obj)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        obj=finish(obj,name,loc,mat,key,min(bevel,min(dims)*.22))
    if rotation: obj.rotation_euler=rotation
    return obj

def cylinder(name, loc, radius, depth, mat='metal', vertices=12, direction=None):
    key=f'cyl_{radius}_{depth}_{vertices}'
    if key in mesh_cache: obj=instance(name,key,loc,mat)
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth)
        obj=finish(bpy.context.object,name,loc,mat,key,min(.018,radius*.13,depth*.2))
    if direction: obj.rotation_euler=Vector(direction).to_track_quat('Z','Y').to_euler()
    return obj

def sphere(name, loc, radius, mat='metal', scale=None):
    key=f'sphere_{radius}'
    if key in mesh_cache: obj=instance(name,key,loc,mat)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=radius)
        obj=finish(bpy.context.object,name,loc,mat,key)
    if scale: obj.scale=scale
    return obj

def bar(name, a, b, radius=.06, mat='metal', vertices=10):
    a,b=Vector(a),Vector(b)
    # Small length quantisation yields reusable modules without visible drift.
    return cylinder(name,(a+b)*.5,radius,round((b-a).length,2),mat,vertices,b-a)

def mesh_object(name,verts,faces,loc,mat,key=None):
    key=key or name
    if key in mesh_cache: return instance(name,key,loc,mat)
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    active_collection.objects.link(obj)
    return finish(obj,name,loc,mat,key)

def text_mesh(body,name,loc,size=.3,mat='cream',rotation=(math.pi/2,0,0)):
    bpy.ops.object.text_add(location=loc)
    obj=bpy.context.object
    obj.name=name
    obj.data.body=body
    obj.data.size=size
    obj.data.align_x='CENTER'
    obj.data.extrude=.012
    obj.data.bevel_depth=0
    obj.rotation_euler=rotation
    in_collection(obj)
    activate(obj)
    bpy.ops.object.convert(target='MESH')
    obj=bpy.context.object
    # Font tessellation can leave collinear triangles on numeral caps.
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    collapsed=[face for face in bm.faces if (face.verts[1].co-face.verts[0].co).cross(face.verts[2].co-face.verts[0].co).length<2e-10]
    if collapsed:bmesh.ops.delete(bm,geom=collapsed,context='FACES')
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    return finish(obj,name,loc,mat,f'text_{name}')

def light(name,loc,color,power,size=.3,type='POINT',target=None):
    data=bpy.data.lights.new(name,type)
    data.energy=power
    data.color=color
    if type=='AREA': data.shape='DISK'; data.size=size
    else: data.shadow_soft_size=size
    obj=bpy.data.objects.new(name,data)
    collections['09 Practical lights'].objects.link(obj)
    obj.location=loc
    if target: obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj

print('BUILD foundation',flush=True)
box('Courtyard / cutaway foundation',(0,0,-.56),(23.2,18.6,.95),'mortar',.14)
box('Perimeter stone footing',(0,0,-.19),(22.5,17.8,.28),'edge',.055)
# Offset courses and individual bevelled stone slabs are real geometry.
for iy in range(19):
    for ix in range(24):
        x=-10.9+ix*.94+(iy%2)*.21
        y=-8.05+iy*.9
        if x>11: continue
        if RNG.random()<.027: continue
        z=RNG.choice([.005,.015,.027,.035])
        o=box(f'Paving / course {iy:02} slab {ix:02}',(x,y,z),(.90,.858,.14),'stone',.026)
        o.rotation_euler=(RNG.uniform(-.014,.014),RNG.uniform(-.014,.014),RNG.uniform(-.01,.01))
        if RNG.random()<.11: o.material_slots[0].material=mats['edge']

# Puddles are closed, shallow, irregular low-poly bodies; portable standard PBR.
for i,(x,y,rx,ry) in enumerate([(-5,1,2.1,1.5),(2,4.2,4.4,1.5),(4,-3,2.5,2),(-3,-6,2.4,1.15),(8,1,1.6,3.5),(-8,5,1.8,1),(-.5,-.5,1.3,.7)]):
    verts=[]
    for k in range(40):
        a=k*math.tau/40
        r=1+.13*math.sin(a*3+.7*i)+.08*math.cos(a*5)+.025*math.sin(a*9)
        verts.append((math.cos(a)*rx*r,math.sin(a)*ry*r,.114))
    verts.append((0,0,.114))
    faces=[(40,k,(k+1)%40) for k in range(40)]
    mesh_object(f'Rainwater / puddle {i+1:02}',verts,faces,(x,y,0),'water')

def drain(x,y,angle=0):
    box('Drain / stone surround',(x,y,.115),(1.1,.50,.08),'edge',.014,(0,0,angle))
    box('Drain / dark recess',(x,y,.16),(.95,.36,.028),'black',.005,(0,0,angle))
    for i in range(11):
        dx=-.425+i*.085
        box('Drain / steel grate',(x+dx*math.cos(angle),y+dx*math.sin(angle),.188),(.023,.34,.025),'metal',.003,(0,0,angle))
for d in [(-7,-4,0),(5,-6,0),(-9,2,math.pi/2),(9,3,math.pi/2),(1,6,0)]: drain(*d)

active_collection=collections['02 Broken courtyard masonry']
print('BUILD masonry',flush=True)
def wall(name,start,length,angle,height,front=False):
    dx,dy=math.cos(angle),math.sin(angle)
    nx,ny=-dy,dx
    def p(u,v,z): return(start[0]+dx*u+nx*v,start[1]+dy*u+ny*v,z)
    count=int(length/.78)
    rows=int(height/.30)
    # Core chunks follow broken silhouette, avoiding floating bricks.
    heights=[rows-RNG.choice([0,0,1,1,2,3,4]) for _ in range(count)]
    for i,h in enumerate(heights):
        if front and 7<i<18: h=max(1,h-3)
        if h<=0:continue
        box(f'{name} / mortar core',p(i*.78+.39,0,h*.30/2),(.79,.43,h*.30),'mortar',.0,(0,0,angle))
    for row in range(rows):
        for i in range(count):
            if row>=heights[i] or (front and 7<i<18 and row>=max(1,heights[i]-3)):continue
            u=(i+.5)*.78+(row%2)*.375
            if u>length-.1:continue
            o=box(f'{name} / brick {row:02}.{i:02}',p(u,0,row*.30+.16),(.744,.57,.265),'brick',.035,(0,0,angle))
            if RNG.random()<.25:o.material_slots[0].material=mats['edge']
            if row>=heights[i]-2: o.rotation_euler[2]+=RNG.uniform(-.075,.075)
    # Monumental stepped pilasters, cornice caps and face ties.
    for u in [0,length*.25,length*.5,length*.75,length]:
        h=height+RNG.choice([.10,.25,.40])
        box(f'{name} / pier',p(u,0,h/2),(.80,.89,h),'brick',.045,(0,0,angle))
        box(f'{name} / pier foot',p(u,0,.35),(1.12,1.15,.6),'edge',.04,(0,0,angle))
        box(f'{name} / cap lower',p(u,0,h),(.97,1.03,.20),'edge',.03,(0,0,angle))
        box(f'{name} / cap stone',p(u,0,h+.19),(1.10,1.16,.16),'edge',.025,(0,0,angle))
        for z in [1.4,2.8,4.15]:
            if z<h-.35: box(f'{name} / structural band',p(u,0,z),(.91,1.0,.14),'mortar',.016,(0,0,angle))
wall('West enclosure',(-11,-8),16.3,math.pi/2,5.25)
wall('North enclosure',(-11,8.15),22,0,6.0)
wall('East enclosure',(11,8.15),15,-math.pi/2,4.35)
wall('South ruined sill',(-11,-8.35),22,0,1.35,True)

# A tall sealed service door to the shop's left.
box('Gate / concrete portal',(-4.2,7.71,2.45),(3.22,.6,4.8),'mortar',.06)
box('Gate / oxidised blast door',(-4.2,7.32,2.22),(2.52,.22,4.13),'teal',.045)
for x in [-5.61,-2.80]:
    box('Gate / vertical jamb',(x,7.31,2.4),(.16,.26,4.7),'metal',.02)
    box('Gate / cyan guide',(x,7.155,2.5),(.05,.05,2.98),'cyan',.006)
for x in [-4.82,-3.62]:
    for z in [1.0,2.42,3.65]:
        box('Gate / recessed panel',(x,7.17,z),(.95,.09,.78),'metal',.045)
        box('Gate / panel lip',(x,7.10,z+.25),(.83,.06,.07),'teal',.014)
bar('Gate / locking spindle',(-4.2,7.01,1.4),(-4.2,7.01,3.45),.045,'rust')
box('Gate / light lintel',(-4.2,7.22,4.63),(2.7,.26,.24),'metal',.022)
for x in [-4.99,-4.2,-3.41]:box('Gate / cyan transom',(x,7.07,4.62),(.52,.035,.065),'cyan',.01)
text_mesh('04','Gate / district stencil',(-4.20,7.06,3.28),.29,'cream')
light('Gate / cyan spill',(-4.2,6.7,2.7),(.21,.8,1),95,.4)

active_collection=collections['03 Repair shop']
print('BUILD shop',flush=True)
box('Repair shop / shell',(2.0,6.88,1.95),(6.4,2.35,3.85),'brick',.065)
box('Repair shop / dark frontage',(2.0,5.61,1.75),(5.92,.18,3.2),'wood',.015)
box('Repair shop / doorstep',(2.0,5.05,.22),(6.55,1.26,.27),'edge',.05)
for x in [-1.1,5.12]:
    box('Repair shop / column',(x,5.41,1.75),(.16,.20,3.45),'rust',.024)
    box('Repair shop / column collar',(x,5.41,.52),(.25,.29,.19),'metal',.018)
box('Shop / service window',(1.03,5.43,1.76),(2.52,.13,1.47),'metal',.035)
box('Shop / interior glow',(1.03,5.34,1.82),(2.22,.035,1.11),'warm',.006)
box('Shop / teal shutter',(1.03,5.27,2.11),(2.31,.08,.70),'teal',.015)
for x in [.15,.59,1.03,1.47,1.91]:box('Shop / shutter seam',(x,5.21,2.11),(.018,.03,.67),'metal',.003)
box('Shop / counter',(1.03,4.98,1.04),(2.83,.70,.16),'wood',.026)
for x in [.01,2.05]:bar('Shop / counter bracket',(x,5.35,.58),(x,4.92,1.02),.035,'metal')
box('Shop / entry door',(3.84,5.42,1.44),(1.48,.15,2.72),'teal',.03)
box('Shop / door glass',(3.84,5.32,2.04),(1.06,.08,.87),'glass',.015)
box('Shop / welcome light',(3.84,5.26,2.10),(.75,.025,.16),'warm',.005)
box('Shop / handle',(4.36,5.25,1.34),(.045,.12,.28),'cream',.01)
for z in [.43,.75]:box('Shop / vent',(3.84,5.32,z),(.89,.04,.09),'metal',.005)
# Sloped metal awning assembled from narrow sheet modules.
for i in range(20):
    x=-1.3+i*.346
    box('Awning / ribbed steel sheet',(x,5.52,3.38),(.333,2.32,.09),'rust' if i%5 else 'teal',.011,(math.radians(16),0,0))
    box('Awning / standing seam',(x-.166,5.52,3.425),(.022,2.34,.055),'metal',.008,(math.radians(16),0,0))
bar('Awning / gutter',(-1.58,4.37,3.12),(5.53,4.37,3.12),.072,'rust')
for x in [-1.16,5.15]:bar('Awning / angled bracket',(x,5.37,2.15),(x,4.52,3.13),.045,'metal')
box('Shop / roof fascia',(2.0,6.93,3.98),(6.78,2.82,.20),'metal',.022)
for i in range(23):
    box('Shop / raised roof seam',(-1.36+i*.302,6.93,4.11),(.031,2.78,.065),'edge',.007)
box('Shop / illuminated sign backing',(2.04,4.32,2.98),(3.73,.14,.30),'black',.025)
text_mesh('REPAIR  /  SUPPLY','Shop / carved sign',(2.04,4.225,2.88),.235,'cream')
for x in [-.58,4.88]:
    box('Lantern / wall plate',(x,5.37,2.16),(.30,.11,.55),'metal',.021)
    box('Lantern / amber diffuser',(x,5.16,2.15),(.29,.31,.44),'warm',.02)
    for z in [1.89,2.42]:box('Lantern / metal cap',(x,5.16,z),(.39,.40,.09),'metal',.014)
    for dx in [-.135,.135]:box('Lantern / cage',(x+dx,4.996,2.16),(.022,.023,.46),'metal',.004)
    light('Shop / warm lantern',(x,4.88,2.15),(1,.47,.16),95,.25)
light('Shop / counter light',(1.0,5.05,1.73),(1,.58,.28),50,.25)

active_collection=collections['04 Industrial skyline']
print('BUILD background',flush=True)
def building(name,x,y,w,d,h):
    box(f'{name} / masonry mass',(x,y,h/2),(w,d,h),'mortar',.07)
    box(f'{name} / facade',(x,y-d/2-.025,h/2),(w-.14,.15,h-.24),'brickwall',.025)
    for z in [h*.34,h*.68,h-.14]:box(f'{name} / belt course',(x,y,z),(w+.28,d+.24,.16),'edge',.02)
    for xx in [x-w/2+.18,x+w/2-.18]:box(f'{name} / corner pier',(xx,y-d/2-.15,h/2),(.30,.38,h),'metal',.018)
    n=max(2,int(w/1.6))
    for ix in range(n):
        wx=x-w/2+(ix+.5)*w/n
        for iz in range(3):
            z=h*.20+iz*(h*.245)
            box(f'{name} / window frame',(wx,y-d/2-.135,z),(w/n*.58,.17,h*.16),'metal',.025)
            box(f'{name} / dark window',(wx,y-d/2-.24,z),(w/n*.50,.045,h*.14),'glass',.008)
            box(f'{name} / mullion',(wx,y-d/2-.27,z),(.036,.035,h*.14),'metal',.002)
            box(f'{name} / sill',(wx,y-d/2-.27,z-h*.075),(w/n*.68,.38,.12),'edge',.01)
    box(f'{name} / roof parapet front',(x,y-d/2,h+.19),(w+.3,.33,.5),'mortar',.018)
    for xx in [x-w/2,x+w/2]:box(f'{name} / roof parapet side',(xx,y,h+.19),(.3,d,.5),'mortar',.018)
    box(f'{name} / roof cap',(x,y,h+.03),(w,d,.13),'metal',.015)
    for i in range(2):
        box(f'{name} / roof plant',(x+(i-.5)*w*.45,y,h+.57),(1.2,1.3,1.1),'metal',.06)
        box(f'{name} / plant lid',(x+(i-.5)*w*.45,y,h+1.15),(1.4,1.47,.14),'edge',.025)
building('North foundry',-6.8,12.1,9,6.7,9.1)
building('East warehouse',6.05,12.7,11.2,6.4,8.15)
building('West turbine hall',-15.2,2.6,6.8,13.1,8.3)
building('East service block',14.4,4.5,5.4,9,6.7)
for i,(x,y,w,d,h) in enumerate([(-12,21,7,7,14),(-3,21,9,7,17),(7,21,8,8,13),(18,18,8,7,17),(-22,9,7,10,14)]):
    box(f'Skyline {i} / silhouette',(x,y,h/2),(w,d,h),'mortar',.05)
    box(f'Skyline {i} / crown',(x,y,h),(w+.4,d+.4,.5),'metal',.025)
    for j in range(int(w/1.5)):
        box('Skyline / vertical recess',(x-w/2+.75+j*1.5,y-d/2-.04,h*.58),(.16,.06,h*.63),'metal',.005)
for x,y,h in [(-9,13,13.5),(-11,14,11.5),(9,14,12.5)]:
    cylinder('Foundry / exhaust stack',(x,y,h-1.5),.30,5.5,'rust',16)
    for z in [h-.8,h+1.1]:cylinder('Foundry / stack collar',(x,y,z),.37,.16,'metal',16)

active_collection=collections['05 Pipes & ventilation']
print('BUILD services',flush=True)
# North wall pipes, clamps and pressure valve.
for x in [-9.6,-8.95,6.18,6.77,9.60]:
    bar('North / vertical service pipe',(x,7.58,.4),(x,7.58,5.75),.075,'rust')
    for z in [.75,2.0,3.4,4.7]:
        cylinder('North / flange',(x,7.58,z),.11,.075,'metal')
        box('North / wall pipe clamp',(x,7.68,z),(.28,.25,.07),'metal',.01)
for z in [4.78,5.05,5.30]:bar('North / pipe manifold',(5.8,7.50,z),(10.7,7.50,z),.066,'rust')
for y in [-5.5,-4.9,1.5,2.0,4.9]:
    bar('West / vertical conduit',(-10.54,y,.5),(-10.54,y,5.25),.063,'metal')
    for z in [1.2,3.0,4.65]:box('West / conduit strap',(-10.60,y,z),(.2,.26,.06),'rust',.01)
bar('West / main distribution',(-10.48,-7.6,3.9),(-10.48,7.4,3.9),.12,'rust')
for y in [-6,-2,3,6]:cylinder('West / distribution flange',(-10.48,y,3.9),.17,.12,'metal',12,(0,1,0))
# Box fan and real grille fins above the repair shop.
for x in [.5,3.9]:
    box('Roof / extractor case',(x,7.30,4.57),(1.12,.82,.90),'teal',.05)
    cylinder('Roof / fan rim',(x,6.84,4.57),.35,.12,'metal',20,(0,1,0))
    cylinder('Roof / fan hub',(x,6.755,4.57),.09,.06,'rust',12,(0,1,0))
    for a in range(5):
        angle=a*math.tau/5
        box('Roof / fan blade',(x+math.cos(angle)*.16,6.78,4.57+math.sin(angle)*.16),(.36,.032,.10),'metal',.012,(0,-angle,0))
    for j in range(6):box('Roof / fan cage',(x-.31+j*.124,6.70,4.57),(.014,.02,.61),'edge',.002)
# Foreground right service shelter, offset so the courtyard remains visible.
box('Service alcove / transformer',(9.65,-4.8,1.3),(1.55,1.65,2.4),'teal',.045)
box('Service alcove / door',(9.65,-5.65,1.3),(1.28,.08,2.1),'metal',.02)
for z in [.8,1,1.2,1.4,1.6]:box('Service alcove / door louvers',(9.65,-5.72,z),(1.08,.05,.07),'teal',.006)
for x in [8.4,10.8]:box('Service alcove / canopy post',(x,-5.85,1.8),(.15,.16,3.6),'metal',.02)
for i in range(10):box('Service alcove / canopy sheet',(8.37+i*.274,-5,3.73),(.267,2.65,.095),'metal',.015,(.12,0,0))
box('Service alcove / signal',(8.40,-5.96,2.94),(.038,.04,.52),'cyan',.006)
light('Service alcove / cyan', (8.2,-5.8,2.8),(.20,.82,1),40,.2)
# Sagging electrical cable using cylindrical spans; exported as mesh.
for i in range(24):
    t=i/24; t2=(i+1)/24
    a=(-10+20*t,3.4+1.2*t,6.6-1.8*math.sin(t*math.pi))
    b=(-10+20*t2,3.4+1.2*t2,6.6-1.8*math.sin(t2*math.pi))
    bar('Overhead / sagging cable',a,b,.018,'black',6)

active_collection=collections['06 Salvage & crates']
print('BUILD salvage',flush=True)
def crate(x,y,z,s=1,rot=0):
    before=set(active_collection.objects)
    box('Salvage / timber crate',(x,y,z+.52*s),(.98*s,.91*s,1.04*s),'wood',.024)
    for dx in [-.48,.48]:
        for dy in [-.44,.44]:box('Crate / steel corner',(x+dx*s,y+dy*s,z+.52*s),(.10*s,.10*s,1.10*s),'metal',.01)
    for zz in [.19,.83]:
        box('Crate / front batten',(x,y-.473*s,z+zz*s),(1.02*s,.075*s,.12*s),'ochre',.014)
        box('Crate / rear batten',(x,y+.473*s,z+zz*s),(1.02*s,.075*s,.12*s),'rust',.014)
    for dx in [-.28,.28]:box('Crate / top binding',(x+dx*s,y,z+1.06*s),(.07*s,.98*s,.055*s),'metal',.008)
    if rot:
        pivot=Vector((x,y,z))
        for o in set(active_collection.objects)-before:
            q=o.location-pivot
            o.location=pivot+Vector((q.x*math.cos(rot)-q.y*math.sin(rot),q.x*math.sin(rot)+q.y*math.cos(rot),q.z))
            o.rotation_euler[2]+=rot
for a in [(-8,-3.7,.18,1,0),(-6.95,-3.6,.18,.85,-.08),(-7.85,-3.65,1.28,.76,.10),(-1.8,4.7,.2,.95,-.10),(-2.72,4.8,.18,.75,.2),(-1.8,4.7,1.2,.68,.06),(7.1,-6.9,.2,1,-.12),(6.1,-7,.18,.75,.08),(7.03,-6.88,1.30,.70,.1)]:crate(*a)
for x,y in [(-8.4,-2.25),(-8.5,5.2),(6.6,6.5)]:
    cylinder('Barrel / corroded drum',(x,y,.70),.40,1.14,'rust',16)
    for z in [.20,.50,1.0,1.26]:cylinder('Barrel / hoop',(x,y,z),.425,.05,'metal',16)
    cylinder('Barrel / lid',(x,y,1.30),.395,.035,'metal',16)
    cylinder('Barrel / filler plug',(x+.17,y,1.34),.05,.05,'ochre',10)
for i in range(5):box('Leaning scrap / boards',(-6.6+i*.13,6.2,.65+i*.03),(.12,.13,1.35),'wood',.01,(0,-.26,.12))
for i in range(4):
    box('Abandoned pallet / slat',(-3+i*.3,-6.5,.21),(.23,1.2,.095),'wood',.016,(0,0,.13))
for y in [-6.9,-6.1]:box('Abandoned pallet / bearer',(-2.54,y,.145),(1.32,.13,.10),'wood',.01)

active_collection=collections['07 Service robots']
print('BUILD robots',flush=True)
def robot(name,x,y,s=1,mat='ochre',angle=0):
    before=set(active_collection.objects)
    def b(n,p,d,m=mat,bv=.025):return box(name+' / '+n,(x+p[0]*s,y+p[1]*s,.15+p[2]*s),tuple(v*s for v in d),m,bv*s)
    def cy(n,p,r,d,m='metal',direction=None):return cylinder(name+' / '+n,(x+p[0]*s,y+p[1]*s,.15+p[2]*s),r*s,d*s,m,12,direction)
    b('lower chassis',(0,0,.44),(.73,.56,.25),'metal')
    b('rounded torso',(0,0,.93),(.78,.56,.76))
    b('front armor',(0,-.31,.94),(.57,.075,.45),'metal')
    b('chest display',(0,-.357,1.05),(.31,.018,.11),'cyan',.006)
    for dx in [-.16,0,.16]:b('chest vent',(dx,-.362,.82),(.028,.02,.14),'cream',.002)
    cy('neck',(0,0,1.43),.11,.18)
    b('sensor head',(0,-.035,1.68),(.80,.60,.43),mat,.06)
    b('dark visor',(0,-.351,1.68),(.64,.045,.26),'black',.02)
    for dx in [-.19,.19]:
        cy('optic bezel',(dx,-.387,1.70),.10,.055,'metal',(0,1,0))
        cy('glowing optic',(dx,-.42,1.70),.067,.02,'warm' if mat=='ochre' else 'cyan',(0,1,0))
    b('head top',(0,-.02,1.925),(.46,.37,.08),'metal')
    cy('antenna',(.24,.10,2.10),.018,.38)
    sphere(name+' / antenna light',(x+.24*s,y+.1*s,.15+2.3*s),.043*s,'warm')
    for side in [-1,1]:
        cy('shoulder',(side*.49,0,1.16),.15,.20,'metal',(1,0,0))
        b('upper arm',(side*.60,-.02,.91),(.20,.24,.44),mat)
        cy('elbow',(side*.61,-.02,.68),.11,.23,'black',(1,0,0))
        b('forearm',(side*.62,-.14,.51),(.23,.29,.28),'metal')
        for dx in [-.08,.08]:b('gripper',(side*.62+dx,-.26,.33),(.045,.24,.17),'cream',.008)
        cy('hip',(side*.24,0,.41),.115,.2,'black',(1,0,0))
        b('leg',(side*.23,-.005,.245),(.21,.25,.28),mat)
        b('foot',(side*.25,-.11,.085),(.32,.50,.16),'metal')
    b('backpack',(0,.36,1.02),(.59,.28,.55),'metal')
    cy('backpack canister',(.24,.50,1.02),.075,.59,'rust')
    # Name and pivot retained as custom metadata for engine asset selection.
    for o in set(active_collection.objects)-before:
        if angle:
            p=o.location-Vector((x,y,.15))
            o.location=Vector((x+p.x*math.cos(angle)-p.y*math.sin(angle),y+p.x*math.sin(angle)+p.y*math.cos(angle),.15+p.z))
            o.rotation_euler[2]+=angle
        o['robot_id']=name
robot('MENDER-07',2.9,-2.15,1.03,'ochre',-.27)
robot('COURIER-12',6.6,-.65,.84,'teal',.30)
robot('KEEPER-03',-3.9,3.15,.64,'cream',-.2)

active_collection=collections['08 Vegetation & debris']
print('BUILD foliage',flush=True)
# Stylised six-vertex leaves, scattered as little ivy clumps.
leafverts=[(0,0,-.12),(-.085,-.014,0),(-.048,.012,.1),(0,.025,.16),(.065,.012,.075),(.09,-.014,-.025)]
for i in range(28):
    x=RNG.choice([-10.58,10.50]) if i<12 else RNG.uniform(-10,10)
    y=RNG.uniform(-6,7) if i<12 else 7.65
    z0=RNG.uniform(2.9,5.4)
    length=RNG.uniform(.65,2.5)
    a=(x,y,z0); b=(x+.13,y-.1,z0-length)
    bar('Ivy / hanging stem',a,b,.016,'soil',6)
    for j in range(RNG.randint(14,30)):
        z=z0-RNG.random()*length
        o=mesh_object('Ivy / leaf',leafverts,[(0,1,2,3,4,5)],(x+RNG.uniform(-.3,.3),y+RNG.uniform(-.19,.13),z),'leaf' if j%3 else 'leaf2','ivy_leaf')
        o.rotation_euler=(RNG.uniform(-.5,.5),RNG.uniform(-.7,.7),RNG.uniform(-2,2))
for i in range(165):
    side=RNG.randrange(3)
    x=RNG.uniform(-10.3,10.3) if side==0 else RNG.choice([-10.25,10.3])+RNG.uniform(-.3,.3)
    y=RNG.choice([-7.65,7])+RNG.uniform(-.3,.3) if side==0 else RNG.uniform(-7,7)
    if i%3==0:
        box('Rubble / broken masonry',(x,y,.15),(.14,.20,.15),'edge',.017,(RNG.random()*.4,RNG.random()*.4,RNG.random()*6))
    else:
        o=mesh_object('Weed / leaf',leafverts,[(0,1,2,3,4,5)],(x,y,.20),'leaf' if i%2 else 'leaf2','ivy_leaf')
        o.rotation_euler=(RNG.uniform(-.6,.6),RNG.uniform(-.6,.6),RNG.uniform(0,6.28))
        o.scale=(1.8,1.8,1.8)
for i in range(14):
    box('Litter / damp paper',(RNG.uniform(-8,8),RNG.uniform(-7,6),.115),(.16,.24,.007),'paper',.002,(0,0,RNG.uniform(0,6.2)))

# Presentation camera and restrained cinematic environment.
active_collection=collections['10 Cameras & studio']
camera_data=bpy.data.cameras.new('Rain Court / hero camera')
camera=bpy.data.objects.new('Rain Court / hero camera',camera_data)
active_collection.objects.link(camera)
camera.location=(25,-33,27)
target=Vector((0,1.0,2.4))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'
camera_data.ortho_scale=37
camera_data.lens=43
scene.camera=camera
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.17,.22,.25,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.36
light('Late sun / warm key',(-12,-4,18),(1,.79,.48),2300,9,'AREA',(0,1,0))
light('Open sky / cool fill',(6,-2,18),(.46,.68,.85),1700,12,'AREA',(0,2,0))
light('Rim / dusty afternoon',(-6,12,17),(1,.73,.39),2500,8,'AREA',(0,0,1))
sun_data=bpy.data.lights.new('Sun / after rain','SUN')
sun_data.energy=1.65
sun_data.angle=math.radians(12)
sun_data.color=(1,.82,.59)
sun=bpy.data.objects.new('Sun / after rain',sun_data)
collections['09 Practical lights'].objects.link(sun)
sun.rotation_euler=(math.radians(26),math.radians(-27),math.radians(-28))
scene.render.engine='CYCLES'
scene.cycles.samples=64
scene.cycles.use_denoising=True
scene.cycles.max_bounces=7
scene.cycles.transparent_max_bounces=4
try:
    pref=bpy.context.preferences.addons['cycles'].preferences
    pref.compute_device_type='OPTIX'
    pref.get_devices()
    for d in pref.devices:d.use=d.type!='CPU'
    scene.cycles.device='GPU'
except Exception as e:print('GPU unavailable, CPU fallback:',e)
scene.render.resolution_x=1800
scene.render.resolution_y=1200
scene.render.resolution_percentage=65 if args.preview else 100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.35
scene.use_nodes=True
nodes=scene.node_tree.nodes
nodes.clear()
rl=nodes.new('CompositorNodeRLayers')
glare=nodes.new('CompositorNodeGlare')
glare.glare_type='FOG_GLOW'
glare.quality='HIGH'
glare.threshold=1.8
glare.mix=-.94
comp=nodes.new('CompositorNodeComposite')
scene.node_tree.links.new(rl.outputs['Image'],glare.inputs['Image'])
scene.node_tree.links.new(glare.outputs['Image'],comp.inputs['Image'])

# Face the facade texture upright while preserving the packed island layout.
for ob in scene.objects:
    if ob.type!='MESH' or not ob.material_slots:continue
    if ob.material_slots[0].material != mats['brickwall']:continue
    mesh=ob.data
    face=max((p for p in mesh.polygons if p.normal.y<-.9),key=lambda p:p.area,default=None)
    if face:
        coords=[(mesh.vertices[mesh.loops[j].vertex_index].co.copy(),mesh.uv_layers.active.data[j].uv.copy()) for j in face.loop_indices]
        left=min(coords,key=lambda v:v[0].x)
        right=max(coords,key=lambda v:v[0].x)
        # Use a same-height edge to avoid diagonal corner ties.
        edge=max(((b[0].x-a[0].x,b[1]-a[1]) for a in coords for b in coords if abs(b[0].z-a[0].z)<.001),key=lambda v:v[0])
        if abs(edge[1].y)>abs(edge[1].x):
            for loop in mesh.uv_layers.active.data:
                u,v=loop.uv[:]
                loop.uv=(v,1-u)

# Save UV layouts as portable vector files before consolidation.
print('UV audit / SVG layouts',flush=True)
audit=[]
for mesh in uv_records:
    uv=mesh.uv_layers.active.data
    points=[tuple(d.uv) for d in uv]
    outside=sum(1 for x,y in points if x<-.0001 or y<-.0001 or x>1.0001 or y>1.0001)
    degenerate=0
    paths=[]
    for poly in mesh.polygons:
        coords=[uv[i].uv[:] for i in poly.loop_indices]
        area=abs(sum(coords[i][0]*coords[(i+1)%len(coords)][1]-coords[(i+1)%len(coords)][0]*coords[i][1] for i in range(len(coords))))*.5
        if area<1e-12:degenerate+=1
        paths.append('M '+' L '.join(f'{x*1024:.3f},{(1-y)*1024:.3f}' for x,y in coords)+' Z')
    filename=mesh.name.replace(' ','_').replace('(','').replace(')','').replace(',','').replace('/','_')+'.svg'
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#152326"/><g fill="#67bfb044" stroke="#c4d9bc" stroke-width="1">'+''.join(f'<path d="{p}"/>' for p in paths)+'</g></svg>'
    (UV/filename).write_text(svg,encoding='utf8')
    audit.append({'mesh':mesh.name,'vertices':len(mesh.vertices),'polygons':len(mesh.polygons),'layout':filename,'out_of_bounds_loops':outside,'degenerate_uv_faces':degenerate,'instances':sum(1 for o in scene.objects if o.type=='MESH' and o.data==mesh),'island_margin':.018})

meshes=[o for o in scene.objects if o.type=='MESH']
triangle_count=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
report={'scene':scene.name,'blender':bpy.app.version_string,'seed':1742,'mesh_objects':len(meshes),'unique_uv_prototypes':len(uv_records),'triangles':triangle_count,'meters':True,'texture_workflow':'ImageGen base color quadrants; derived normal and roughness maps; standard Principled BSDF / glTF metallic-roughness','uv_policy':'Every unique prototype is smart-projected with 0.018 margin. No unintended prototype self-overlap. Repeated modular instances intentionally reuse texture coordinates. Text and irregular puddles are unique meshes.','prototypes':audit,'build_seconds_before_export':round(time.time()-START,1)}
(ROOT/'docs'/'asset-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
# Pack raster maps into the original .blend for self-contained editing.
for img in bpy.data.images:
    if img.source=='FILE':img.pack()
activate(camera)
scene['README']='AFTERLIGHT / The Rain Court. Rebuild with source/build_scene.py. UV policy and map provenance in docs. All visible surfaces are meshes. Metric scale. Camera: +Z up in Blender, glTF converts to +Y up.'
bpy.ops.wm.save_as_mainfile(filepath=str(MODELS/'afterlight-rain-court.blend'))

# Geometry-only export: keep real lamp emitters, omit renderer-specific area lamps.
for o in scene.objects:o.select_set(o.type=='MESH')
bpy.context.view_layer.objects.active=meshes[0]
print('EXPORT GLB',flush=True)
bpy.ops.export_scene.gltf(filepath=str(MODELS/'afterlight-rain-court.glb'),export_format='GLB',use_selection=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True,export_image_format='AUTO')
print('EXPORT FBX',flush=True)
bpy.ops.export_scene.fbx(filepath=str(MODELS/'afterlight-rain-court.fbx'),use_selection=True,object_types={'MESH'},apply_unit_scale=True,axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True,use_mesh_modifiers=True,add_leaf_bones=False,bake_anim=False)
if args.render:
    print('RENDER hero',flush=True)
    scene.render.filepath=str(OUT/'renders'/'rain-court-hero.png')
    bpy.ops.render.render(write_still=True)
    # Close camera documents real model detail; same scene, no painted plate.
    camera.location=(12,-14,13)
    camera.rotation_euler=(Vector((1.0,3.1,1.8))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=19.8
    scene.render.resolution_x=1600
    scene.render.resolution_y=1200
    scene.render.filepath=str(OUT/'renders'/'rain-court-detail.png')
    bpy.ops.render.render(write_still=True)
print(json.dumps({'complete':True,'mesh_objects':len(meshes),'triangles':triangle_count,'prototypes':len(uv_records),'seconds':round(time.time()-START,1)}),flush=True)
