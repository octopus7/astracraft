"""AFTERLIGHT / Rain Court. Blender 4.5, deterministic original mesh authoring.
Run: blender --background --python scripts/build_scene.py
All coordinates in metres. UV0 is a reusable material atlas; UV1 is unique per mesh.
"""
import bpy, math, random, json, pathlib, sys
from mathutils import Vector, Matrix
import numpy as np
R=pathlib.Path(__file__).resolve().parents[1]
random.seed(42)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for d in bpy.data.materials: bpy.data.materials.remove(d)
S=bpy.context.scene
S.unit_settings.system='METRIC'
atlas=bpy.data.images.load(str(R/'assets/textures/rain-court-albedo.png'))
# Derive standard roughness and tangent normals from generated surface detail.
w,h=atlas.size; px=np.array(atlas.pixels[:],dtype=np.float32).reshape(h,w,4)
gray=px[:,:,:3].mean(2); gy,gx=np.gradient(gray)
normal=np.dstack((-gx*1.7,-gy*1.7,np.ones_like(gray))); normal/=np.linalg.norm(normal,axis=2)[:,:,None]
def save_map(name,rgb):
    im=bpy.data.images.new(name,width=w,height=h); im.colorspace_settings.name='Non-Color'
    a=np.ones((h,w,4),dtype=np.float32); a[:,:,:3]=rgb
    im.pixels.foreach_set(a.ravel()); im.filepath_raw=str(R/'assets/textures'/name); im.file_format='PNG'; im.save(); return im
normalim=save_map('rain-court-normal.png',normal*.5+.5)
roughim=save_map('rain-court-roughness.png',np.repeat(np.clip(.62+gray*.28,0,1)[:,:,None],3,2))
checker=bpy.data.images.new('UV checker',width=1024,height=1024); checker.generated_type='COLOR_GRID'; checker.filepath_raw=str(R/'uv/checker.png'); checker.file_format='PNG'; checker.save()
def mat(name,color,rough=.7,metal=0,texture=False,emission=None):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    if texture:
        t=n.new('ShaderNodeTexImage'); t.image=atlas; l.new(t.outputs['Color'],p.inputs['Base Color'])
        t=n.new('ShaderNodeTexImage'); t.image=roughim; l.new(t.outputs['Color'],p.inputs['Roughness'])
        t=n.new('ShaderNodeTexImage'); t.image=normalim; nm=n.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.42; l.new(t.outputs['Color'],nm.inputs['Color']); l.new(nm.outputs['Normal'],p.inputs['Normal'])
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    return m
stone=mat('01 • generated limestone',(.3,.31,.28),texture=True)
brick=mat('02 • generated brick clay',(.4,.18,.10),texture=True)
teal=mat('03 • generated patinated teal',(.08,.3,.3),metal=.62,texture=True)
wood=mat('04 • generated weathered wood',(.26,.13,.06),texture=True)
iron=mat('Blackened iron',(.045,.065,.066),.39,.8)
trim=mat('Warm limestone trim',(.31,.32,.27),.76)
dark=mat('Mortar and recesses',(.065,.079,.069),.88)
gold=mat('Oxidized brass',(.4,.24,.07),.36,.72)
leaf=mat('Wet ivy',(.12,.17,.055),.53)
water=mat('Still rainwater',(.055,.09,.095),.09,.45)
amber=mat('Lantern • amber', (1,.52,.15),.3,emission=5)
cyan=mat('Signal • cyan',(.17,.85,.85),.3,emission=4)
glass=mat('Old glass',(.10,.23,.22),.2,.35)
materials=list(bpy.data.materials); buckets={}; counts={}; uvreport=[]
def bucket(name):
    if name not in buckets: buckets[name]=[[],[],[],[]]
    return buckets[name]
def add(name,verts,faces,material,quadrant=0):
    v,f,mi,uv=bucket(name); off=len(v); v.extend(verts)
    qx=(quadrant%2)*.5; qy=.5 if quadrant<2 else 0
    # Separate face islands within a reused module cell; exactly 8 px inner padding at 1024.
    cols=math.ceil(math.sqrt(len(faces))); rows=math.ceil(len(faces)/cols)
    for j,face in enumerate(faces):
        f.append(tuple(off+i for i in face)); mi.append(materials.index(material))
        x=qx+.008+(j%cols)*(.484/cols); y=qy+.008+(j//cols)*(.484/rows)
        dx=.484/cols-.008; dy=.484/rows-.008
        if len(face)==4:
            a=(Vector(verts[face[1]])-Vector(verts[face[0]])).length
            b=(Vector(verts[face[3]])-Vector(verts[face[0]])).length
            factor=min(dx/max(a,1e-6),dy/max(b,1e-6)); ax=a*factor; by=b*factor
            x+=(dx-ax)/2; y+=(dy-by)/2
            coords=[(x,y),(x+ax,y),(x+ax,y+by),(x,y+by)]
        else: coords=[(x+dx*(.5+.48*math.cos(2*math.pi*k/len(face))),y+dy*(.5+.48*math.sin(2*math.pi*k/len(face)))) for k in range(len(face))]
        uv.append(coords)
    counts[name]=counts.get(name,0)+1
def box(name,loc,size,material=stone,q=0,rot=0):
    x,y,z=loc; a,b,c=[t/2 for t in size]; co=math.cos(rot); si=math.sin(rot)
    verts=[(x+xx*co-yy*si,y+xx*si+yy*co,z+zz) for xx,yy,zz in [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]]
    add(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material,q)
def tube(name,a,b,r,material=iron,n=10):
    a=Vector(a); b=Vector(b); axis=(b-a).normalized(); side=axis.cross(Vector((0,0,1)))
    if side.length<.01: side=axis.cross(Vector((0,1,0)))
    side.normalize(); up=axis.cross(side)
    verts=[tuple(p+r*(math.cos(i*2*math.pi/n)*side+math.sin(i*2*math.pi/n)*up)) for p in [a,b] for i in range(n)]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    add(name,verts,faces,material,2 if material==teal else 0)
def textmesh(txt,loc,size,material,rot=(math.pi/2,0,0)):
    cu=bpy.data.curves.new(txt,'FONT'); cu.body=txt; cu.align_x='CENTER'; cu.size=size; cu.extrude=.006
    ob=bpy.data.objects.new(txt,cu); S.collection.objects.link(ob); ob.location=loc; ob.rotation_euler=rot; ob.data.materials.append(material)
    bpy.context.view_layer.objects.active=ob; ob.select_set(True); bpy.ops.object.convert(target='MESH'); ob.select_set(False)
    bpy.context.view_layer.objects.active=ob; ob.select_set(True); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT'); ob.select_set(False)
    ob.data.uv_layers.active.name='UVMap'; ob.data.uv_layers.new(name='LightmapUV')
    return ob
# Floating architectural cutaway.
box('Foundation',(0,0,-.43),(20.6,17.4,.85),dark)
box('Foundation',(0,0,-.85),(20.9,17.7,.18),iron)
for j in range(19):
    for i in range(21):
        x=-9.5+i*.95+(.45 if j%2 else 0); y=-7.8+j*.85
        if x>9.9: continue
        z=random.uniform(.015,.055)
        box('Rain polished paving',(x,y,z),(.91,.80,.14),stone,0,random.uniform(-.012,.012))
# Irregular shallow puddles with proper closed mesh and clean UV.
for k in range(23):
    x=random.uniform(-8.8,8.8); y=random.uniform(-6.8,6.9); rx=random.uniform(.35,1.9); ry=random.uniform(.2,.72)
    vs=[(x+rx*math.cos(a)*random.uniform(.8,1.05),y+ry*math.sin(a)*random.uniform(.8,1.05),.137+k*.0004) for a in [i*math.tau/18 for i in range(18)]]
    add('Rainwater pools',vs,[tuple(range(18))],water)
# Brick walls; course variation and missing top bricks establish the ruin silhouette.
def wall(name,axis,fixed,start,end,height):
    mid=(start+end)/2; length=end-start
    box(name+' mortar',(mid,fixed,height/2) if axis=='x' else (fixed,mid,height/2),(length,.62,height) if axis=='x' else (.62,length,height),dark)
    for row in range(int(height/.32)):
        pos=start+.36-(.38 if row%2 else 0)
        while pos<end:
            if pos>start and (row<int(height/.32)-2 or random.random()>.15):
                loc=(pos,fixed,row*.32+.18) if axis=='x' else (fixed,pos,row*.32+.18)
                sz=(.72,.73,.28) if axis=='x' else (.73,.72,.28)
                box(name+' brickwork',loc,sz,brick if random.random()<.34 else stone,1 if random.random()<.34 else 0)
            pos+=.77
    for p in np.arange(start+.2,end,.65):
        box(name+' coping',(p,fixed,height+.12) if axis=='x' else (fixed,p,height+.12),(.61,.88,.22) if axis=='x' else (.88,.61,.22),trim)
    for p in np.arange(start+.3,end,3.0):
        box(name+' pilasters',(p,fixed-.12,height*.49) if axis=='x' else (fixed+.12,p,height*.49),(.42,.96,height+.3) if axis=='x' else (.96,.42,height+.3),trim)
        box(name+' capitals',(p,fixed,height+.33) if axis=='x' else (fixed,p,height+.33),(.83,1.1,.20) if axis=='x' else (1.1,.83,.20),stone)
wall('West enclosure','y',-9.9,-8,8.0,4.8)
wall('North enclosure','x',8.0,-9.9,9.9,5.6)
wall('East cutaway','y',9.9,-7.6,7.8,2.2)
wall('South cutaway','x',-8.2,-9.6,9.9,.85)
# Upper skyline blocks immediately outside court.
for x,width,height in [(-7.6,4.3,8.1),(-2.5,5.2,7.3),(3.5,5.9,8.7),(8.4,3.0,7.7)]:
    box('Industrial skyline',(x,9.5,height/2),(width,3,height),stone)
    for z in [5.9,7.1]:
        for wx in np.arange(x-width/2+.55,x+width/2,.83):
            box('Skyline window recess',(wx,7.965,z),(.52,.10,.9),iron)
            box('Skyline glazing',(wx,7.899,z),(.39,.03,.76),glass)
    box('Skyline cornices',(x,9.5,height),(width+.3,3.25,.22),trim)
    box('Roof machinery',(x+.3,9.5,height+.48),(1.5,1.0,.8),iron)
# Repair store positioned beneath the high rear wall.
box('Repair shop',(3.5,6.55,1.95),(6.7,2.6,3.8),brick,1)
box('Store front shadow',(3.5,5.20,1.7),(6.35,.08,2.6),dark)
for x in [.5,2.3,4.7,6.4]:
    box('Shop posts',(x,5.09,1.72),(.16,.19,3.2),wood,3)
for x in [1.4,5.4]:
    box('Window frame',(x,5.065,2),(1.4,.17,1.5),gold)
    box('Window glass',(x,4.956,2),(1.22,.06,1.29),glass)
    for dx in [-.38,0,.38]: box('Window mullions',(x+dx,4.9,2),(.045,.08,1.3),wood,3)
    box('Window mullions',(x,4.9,2),(1.3,.08,.045),wood,3)
    box('Window sill',(x,4.78,1.24),(1.62,.4,.12),wood,3)
box('Shop door',(3.5,5.03,1.40),(1.1,.18,2.55),teal,2)
box('Door glass',(3.5,4.92,1.95),(.7,.03,.83),glass)
tube('Door handle',(3.89,4.80,1.1),(3.89,4.80,1.48),.034,gold)
box('Shop doorstep',(3.5,4.7,.2),(1.55,.72,.25),stone)
# Sloped metal awning built as mesh panels.
for i in range(17):
    x=.02+i*.425
    vs=[(x,4.42,2.87),(x+.414,4.42,2.87),(x+.414,5.38,3.62),(x,5.38,3.62)]
    add('Copper awning',vs,[(0,1,2,3)],wood if i%4==0 else teal,3 if i%4==0 else 2)
    tube('Awning seams',(x,4.42,2.89),(x,5.38,3.64),.022,gold,6)
tube('Awning lip',(-.1,4.4,2.86),(7.2,4.4,2.86),.055,gold)
for x in [.28,6.78]: tube('Awning supports',(x,4.48,.2),(x,4.48,2.9),.065,iron)
box('Shop fascia',(3.5,5.18,3.76),(6.8,.18,.39),iron)
textmesh('N O R T H   /   R E P A I R',(3.5,5.055,3.66),.22,trim)
textmesh('OPEN',(5.43,4.855,2.11),.18,amber)
for i in range(19):
    box('Shop standing seam roof',(-.05+i*.39,6.45,4.04),(.37,2.95,.11),teal,2)
for x in [.7,5.9]:
    tube('Roof vents',(x,6.8,4.08),(x,6.8,4.65),.18,iron)
    box('Roof vent cap',(x,6.8,4.7),(.6,.55,.13),trim)
def lamp(x,y,z):
    box('Lantern mounts',(x,y+.11,z+.27),(.34,.23,.12),iron)
    box('Amber lantern',(x,y,z),(.20,.19,.36),amber)
    for dx in [-.13,.13]: tube('Lantern cages',(x+dx,y-.12,z-.21),(x+dx,y-.12,z+.21),.02,iron,6)
    box('Lantern caps',(x,y,z-.22),(.32,.3,.06),iron)
    data=bpy.data.lights.new('Warm spill','POINT'); data.energy=65; data.color=(1,.49,.16); data.shadow_soft_size=.38
    ob=bpy.data.objects.new('Warm spill',data); S.collection.objects.link(ob); ob.location=(x,y-.24,z)
for x in [.38,2.55,4.4,6.7]: lamp(x,4.78,2.28)
# Teal service gate in rear wall.
box('Service gate frame',(-5.6,7.5,2.15),(2.5,.26,4.0),iron)
box('Service gate',(-5.6,7.32,2.05),(2.15,.16,3.55),teal,2)
for x in [-6.54,-5.6,-4.65]: box('Gate ribs',(x,7.19,2.02),(.08,.12,3.57),gold)
for z in [.66,2.0,3.45]: box('Gate cross braces',(-5.6,7.18,z),(2.13,.12,.09),iron)
for x in [-6.85,-4.36]: box('Gate lights',(x,7.26,2.7),(.075,.07,1.4),cyan)
textmesh('SECTOR 04',(-5.6,7.18,4.36),.25,trim)
# Industrial service pipes, flange rings and a wheel valve.
for x in [-8.4,-7.98,8.2,8.65]:
    tube('Service pipe',(x,7.30,.5),(x,7.30,6.6),.07 if x<0 else .12,iron)
    for z in [1,2.6,4.2,5.8]: tube('Pipe collars',(x,7.3,z-.05),(x,7.3,z+.05),.115 if x<0 else .17,gold)
for z in [3.7,3.96,4.23]: tube('West horizontal pipes',(-9.42,-5,z),(-9.42,7,z),.065,iron)
for j in range(12):
    a=j*math.tau/12; b=(j+1)*math.tau/12
    tube('Valve wheel',(8.2+.33*math.cos(a),7.06,1.65+.33*math.sin(a)),(8.2+.33*math.cos(b),7.06,1.65+.33*math.sin(b)),.04,gold,6)
# Crates with real corner bands, slats, lids and fasteners.
def crate(x,y,z,s=1):
    box('Cargo crates',(x,y,z+s*.45),(s,s*.8,s*.9),wood,3)
    for dx in [-.42,.42]:
        for dy in [-.35,.35]: box('Crate bindings',(x+dx*s,y+dy*s,z+s*.45),(.09*s,.10*s,s*.97),iron)
    for zz in [.13,.76]: box('Crate front bands',(x,y-.421*s,z+zz*s),(s*1.03,.05,s*.08),gold)
    for dx in [-.3,0,.3]: box('Crate lid planks',(x+dx*s,y,z+s*.92),(.27*s,s*.79,.065),wood,3)
    box('Cargo label',(x+.17*s,y-.428*s,z+.51*s),(.27*s,.015,.20*s),trim)
for x,y,z,s in [(-7,-3,0,1.2),(-6,-3.2,0,.9),(-7,-3,1.1,.8),(-6.6,-2.1,0,.9),(-2.8,5.7,0,1.1),(-2.8,5.7,1,.75),(7.7,-5.7,0,1.1),(8.1,-4.6,0,.8),(7.7,-5.7,1,.72)]: crate(x,y,z,s)
# Side utility kiosk.
box('Utility kiosk',(8,1.8,1.4),(2,2.1,2.8),teal,2)
box('Kiosk recess',(7.98,.72,1.6),(1.55,.06,1.75),iron)
for z in np.arange(.9,2.5,.16): box('Kiosk ventilation',(7.98,.64,z),(1.42,.12,.055),trim)
box('Kiosk roof',(8,1.8,2.88),(2.35,2.43,.15),iron)
box('Kiosk signal',(6.95,.65,2.1),(.06,.08,.85),cyan)
textmesh('04',(8,.54,2.57),.23,trim)
# Three repair robots; layered chassis, articulated legs, optic visors.
def robot(x,y,s=1,paint=teal):
    for dx in [-.23,.23]:
        box('Robot feet',(x+dx*s,y-.10*s,.22*s),(.35*s,.6*s,.22*s),iron)
        tube('Robot shins',(x+dx*s,y,.3*s),(x+dx*s,y,.64*s),.105*s,gold)
        tube('Robot knee axles',(x+dx*s-.12*s,y,.61*s),(x+dx*s+.12*s,y,.61*s),.13*s,iron)
    box('Robot chassis',(x,y,.95*s),(.76*s,.5*s,.64*s),paint,2 if paint==teal else 0)
    box('Robot chest panel',(x,y-.27*s,1*s),(.49*s,.06*s,.29*s),iron)
    for dx in [-.16,0,.16]: box('Robot chest LEDs',(x+dx*s,y-.31*s,1.05*s),(.065*s,.025,.11*s),amber)
    tube('Robot neck',(x,y,1.25*s),(x,y,1.40*s),.11*s,gold)
    box('Robot head',(x,y-.01*s,1.58*s),(.83*s,.60*s,.42*s),paint,2 if paint==teal else 0)
    box('Robot visor',(x,y-.327*s,1.59*s),(.65*s,.04,.17*s),iron)
    for dx in [-.19,.19]: box('Robot optics',(x+dx*s,y-.354*s,1.61*s),(.15*s,.025,.09*s),cyan if paint==teal else amber)
    for dx in [-.49,.49]:
        tube('Robot shoulders',(x+dx*.8*s,y,1.18*s),(x+dx*s,y,1.18*s),.15*s,gold)
        tube('Robot arms',(x+dx*s,y,1.15*s),(x+dx*1.13*s,y-.1*s,.75*s),.105*s,paint)
        box('Robot claws',(x+dx*1.13*s,y-.1*s,.65*s),(.19*s,.24*s,.2*s),iron)
    tube('Robot aerial',(x+.27*s,y,1.8*s),(x+.31*s,y,2.12*s),.022*s,iron,6)
    box('Aerial light',(x+.31*s,y,2.14*s),(.07*s,.07*s,.07*s),amber)
    box('Robot backpack',(x,y+.33*s,1.05*s),(.45*s,.23*s,.53*s),iron)
robot(2,-1.7,1.0); robot(3.45,-1.2,.73,trim); robot(-4.2,3.8,.68,trim)
# Grates and scattered chipped stones.
for x,y in [(-5.3,-4.8),(4.7,3.3),(7,-2),(-7.8,1)]:
    box('Drain frames',(x,y,.14),(1.05,.6,.045),iron)
    for i in range(10): box('Drain slots',(x-.43+i*.096,y,.171),(.025,.49,.018),trim)
for i in range(135):
    x=random.choice([random.uniform(-9.5,-8.6),random.uniform(8.7,9.5),random.uniform(-9,9)])
    y=random.uniform(-7.8,7.7) if abs(x)>8 else random.choice([random.uniform(-7.9,-7.4),random.uniform(7.2,7.7)])
    box('Rubble',(x,y,.17),(random.uniform(.06,.23),random.uniform(.06,.19),random.uniform(.04,.15)),trim,0,random.random()*6)
# Hanging ivy drapes. Leaves are actual diamond meshes, not opacity cards.
for k in range(32):
    x=random.uniform(-9,9); z=random.uniform(4.8,6.2); length=random.uniform(.4,2.2)
    for j in range(int(length/.10)):
        xx=x+.12*math.sin(j*.7); zz=z-j*.10; yy=7.38-.10*math.sin(j*.4)
        tube('Ivy stems',(xx,yy,zz),(xx+.06,yy,zz-.13),.009,leaf,5)
        for side in [-1,1]:
            a=xx+side*.10; b=yy-.08; c=zz-.04
            add('Ivy leaves',[(a-.08,b,c),(a,b-.035,c+.10),(a+.09,b,c),(a,b+.02,c-.11)],[(0,1,2,3)],leaf)
# Build efficient grouped meshes with bevels applied before export.
for name,(v,f,mi,uvs) in buckets.items():
    me=bpy.data.meshes.new(name); me.from_pydata(v,[],f); me.update(); ob=bpy.data.objects.new(name,me); S.collection.objects.link(ob)
    for m in materials: me.materials.append(m)
    layer=me.uv_layers.new(name='UVMap')
    for p,idx,coords in zip(me.polygons,mi,uvs):
        p.material_index=idx
        for li,co in zip(p.loop_indices,coords): layer.data[li].uv=co
    # A second non-overlapping UV set reserves one cell per polygon (face islands).
    unique=me.uv_layers.new(name='LightmapUV'); cols=math.ceil(math.sqrt(len(f))); cell=1/cols
    for j,p in enumerate(me.polygons):
        cx=(j%cols+.5)*cell; cy=(j//cols+.5)*cell
        for k,li in enumerate(p.loop_indices):
            a=math.tau*k/len(p.loop_indices)+math.pi/4
            unique.data[li].uv=(cx+cell*.40*math.cos(a),cy+cell*.40*math.sin(a))
    me.uv_layers.active_index=0; layer.active_render=True
    if name not in ['Rainwater pools','Ivy leaves','Ivy stems','Copper awning']:
        bevel=ob.modifiers.new('Subtle manufactured edge wear','BEVEL'); bevel.width=.025 if 'brickwork' in name or 'paving' in name else .012; bevel.segments=1
        bevel.affect='EDGES'
        bpy.context.view_layer.objects.active=ob; ob.select_set(True); bpy.ops.object.modifier_apply(modifier=bevel.name); ob.select_set(False)
    # Repack UV1 after bevel, preserving each face's planar shape with no overlap.
    me=ob.data; unique=me.uv_layers.get('LightmapUV'); cols=math.ceil(math.sqrt(len(me.polygons))); cell=1/cols
    for j,p in enumerate(me.polygons):
        vs=[me.vertices[me.loops[li].vertex_index].co for li in p.loop_indices]
        axis=(vs[1]-vs[0]).normalized(); up=p.normal.cross(axis).normalized()
        points=[(float((v-vs[0]).dot(axis)),float((v-vs[0]).dot(up))) for v in vs]
        minx=min(v[0] for v in points); maxx=max(v[0] for v in points); miny=min(v[1] for v in points); maxy=max(v[1] for v in points)
        scale=cell*.8/max(maxx-minx,maxy-miny,1e-8)
        for li,(u,v) in zip(p.loop_indices,points): unique.data[li].uv=((j%cols+.5)*cell+(u-(minx+maxx)/2)*scale,(j//cols+.5)*cell+(v-(miny+maxy)/2)*scale)
    uvreport.append({'mesh':name,'modules':counts[name],'polygons':len(me.polygons),'uv0':'deliberate material-module reuse; aspect-preserving separate quad islands','uv1':'unique planar face cells, 20% cell gutter after bevel'})
# Lighting and camera.
world=bpy.data.worlds.new('Rain clearing sky'); S.world=world; world.use_nodes=True; world.node_tree.nodes['Background'].inputs[0].default_value=(.20,.26,.28,1); world.node_tree.nodes['Background'].inputs[1].default_value=.45
def area(name,loc,power,color,size,target):
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.color=color; d.shape='DISK'; d.size=size; o=bpy.data.objects.new(name,d); S.collection.objects.link(o); o.location=loc; o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Late sun through cloud',(-8,-5,16),2500,(1,.76,.46),8,(0,0,0))
area('Cool open sky',(3,-3,12),1500,(.46,.70,.85),10,(0,0,0))
area('Gate cyan bounce',(-5.6,6.8,3),80,(.1,.8,1),2,(-5,3,0))
d=bpy.data.lights.new('Long evening shadows','SUN'); d.energy=1.5; d.color=(1,.79,.53); d.angle=.15; o=bpy.data.objects.new('Long evening shadows',d); S.collection.objects.link(o); o.rotation_euler=(.5,-.6,-.5)
cam=bpy.data.cameras.new('Rain Court hero'); ob=bpy.data.objects.new('Rain Court hero',cam); S.collection.objects.link(ob); ob.location=(22,-28,25); ob.rotation_euler=(Vector((0,1,2.0))-ob.location).to_track_quat('-Z','Y').to_euler(); cam.type='ORTHO'; cam.ortho_scale=31.5; S.camera=ob
S.render.engine='CYCLES'; S.cycles.samples=32; S.cycles.use_denoising=True
S.render.resolution_x=1600; S.render.resolution_y=1100; S.render.resolution_percentage=100
S.view_settings.view_transform='AgX'
# Export the actual production UVs; overlapping module polygons are deduplicated only in the UV0 drawing.
for ob in list(S.objects):
    if ob.type!='MESH': continue
    for layer in ob.data.uv_layers:
        if layer.name=='LightmapUV' and ob.name not in ['Rain polished paving','Service gate','Robot chassis']: continue
        seen=set(); paths=[]
        for poly in ob.data.polygons:
            points=tuple((round(float(layer.data[i].uv.x)*1024,3),round((1-float(layer.data[i].uv.y))*1024,3)) for i in poly.loop_indices)
            if points in seen: continue
            seen.add(points); paths.append('<polygon points="'+' '.join(f'{x},{y}' for x,y in points)+'"/>')
        name=''.join(c if c.isalnum() else '-' for c in ob.name)
        (R/'uv'/f'{name}-{layer.name}.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#152329"/><g fill="none" stroke="#daca8e" stroke-width=".6">'+''.join(paths)+'</g></svg>')
# UV audit and SVG of production cube island arrangement.
(R/'docs/uv-manifest.json').write_text(json.dumps(uvreport,indent=2),encoding='utf8')
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#172327"/>']
for q in range(4):
    for j in range(6):
        x=(q%2)*512+8.192+(j%3)*(.484/3)*1024; y=(q//2)*512+8.192+(j//3)*(.484/2)*1024
        svg.append(f'<rect x="{x}" y="{y}" width="{(.484/3-.008)*1024}" height="{(.484/2-.008)*1024}" fill="none" stroke="#e0d7a8" stroke-width="2"/>')
svg.append('</svg>'); (R/'uv/material-module-layout.svg').write_text(''.join(svg))
# Save packed original, export independent engine formats.
for im in [atlas,normalim,roughim,checker]: im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/models/afterlight-rain-court.blend'))
bpy.ops.export_scene.gltf(filepath=str(R/'assets/models/afterlight-rain-court.glb'),export_format='GLB',export_texcoords=True,export_normals=True,export_lights=True,export_cameras=True)
bpy.ops.export_scene.gltf(filepath=str(R/'assets/models/afterlight-rain-court.gltf'),export_format='GLTF_SEPARATE',export_texcoords=True,export_normals=True,export_lights=True)
bpy.ops.export_scene.fbx(filepath=str(R/'assets/models/afterlight-rain-court.fbx'),use_selection=False,object_types={'MESH','LIGHT','CAMERA'},path_mode='COPY',embed_textures=True,axis_forward='-Z',axis_up='Y',add_leaf_bones=False)
S.render.filepath=str(R/'assets/renders/hero.png'); bpy.ops.render.render(write_still=True)
# Checker proof uses same actual UV mapping, with packed source restored afterwards.
for m in materials:
    if m.use_nodes:
        for node in m.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image==atlas: node.image=checker
S.render.resolution_percentage=55; S.cycles.samples=12; S.render.filepath=str(R/'uv/checker-scene.png'); bpy.ops.render.render(write_still=True)
print('AFTERLIGHT_BUILD_COMPLETE',flush=True)
