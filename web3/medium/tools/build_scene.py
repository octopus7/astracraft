"""Blender 4.5+, deterministic modular Rain Court. Run blender -b -t 4 -P this_file."""
import bpy, math, random, json, os
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'
random.seed(42)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
atlas=bpy.data.images.load(str(OUT/'surface-atlas.png'))
atlas.filepath='//surface-atlas.png'
materials={}
quadrants={'stone':(0,.5),'metal':(.5,.5),'rust':(0,0),'wood':(.5,0)}
def material(name,color,rough=.65,metal=0,texture=None,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
 p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if texture:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=atlas
  m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
 if emission:
  p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 materials[name]=(m,quadrants.get(texture))
 return name
stone=material('Limestone | atlas NW',(.4,.4,.35),.78,texture='stone')
metal=material('Petrol paint | atlas NE',(.1,.19,.18),.42,.55,'metal')
rust=material('Oxidized iron | atlas SW',(.3,.15,.07),.65,.4,'rust')
wood=material('Salvaged timber | atlas SE',(.17,.12,.08),.8,texture='wood')
dark=material('Graphite rubber',(.035,.045,.044),.83)
water=material('Rainwater',(.14,.19,.18),.13,.35)
brass=material('Aged brass',(.46,.28,.095),.38,.65)
leaf=material('Moss olive',(.17,.22,.085),.91)
leaf2=material('Damp ivy',(.07,.135,.065),.87)
cyan=material('Signal mint',(.25,.85,.78),.3,0,emission=3)
amber=material('Lantern amber',(1,.57,.19),.4,0,emission=4)
ivory=material('Robot enamel',(.62,.64,.51),.4,.25)
orange=material('Ochre workwear',(.48,.23,.055),.72)

def box(name,loc,size,mat,rot=0,bevel=.025):
 x,y,z=[v/2 for v in size]
 verts=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
 faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler.z=rot
 mesh.materials.append(materials[mat][0]);uv=mesh.uv_layers.new(name='UVMap')
 # Six nonoverlapping, proportion-correct face islands. Same material modules intentionally reuse the atlas.
 origin=materials[mat][1] or (0,0);extent=.5 if materials[mat][1] else 1
 sx,sy,sz=size;dimensions=[(sy,sx),(sx,sy),(sx,sz),(sy,sz),(sx,sz),(sy,sz)]
 cell=(extent-.028)/3;scale=(cell-.008)/max(size)
 for i,p in enumerate(mesh.polygons):
  w,h=dimensions[i];u=origin[0]+.014+(i%3)*cell;v=origin[1]+.014+(i//3)*(extent-.028)/2
  for li,coord in zip(p.loop_indices,[(u,v),(u+w*scale,v),(u+w*scale,v+h*scale),(u,v+h*scale)]):uv.data[li].uv=coord
 if bevel:
  mod=obj.modifiers.new('Soft manufactured edges','BEVEL');mod.width=min(bevel,min(size)*.16);mod.segments=1
  mod=obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return obj

def cylinder(name,a,b,r,mat,vertices=10):
 a,b=Vector(a),Vector(b);d=b-a
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)/2)
 o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(materials[mat][0])
 # Blender primitive cylinder has disjoint cap/side UV islands; fit to selected atlas quadrant.
 q=materials[mat][1] or (0,0);extent=.472 if materials[mat][1] else .94
 for t in o.data.uv_layers.active.data:t.uv=(q[0]+.025+t.uv.x*extent,q[1]+.025+t.uv.y*extent)
 return o

box('Courtyard foundation',(0,0,-.42),(18,15,.8),dark,.0,.12)
# Individual irregular paving stones with gaps and drainage channels.
for row in range(17):
 for col in range(18):
  x=-8.5+col+.25*(row%2);y=-6.6+row*.79
  if x>8.3:continue
  box('Paving slab', (x,y,random.uniform(-.045,.005)),(.94,random.uniform(.69,.76),.13),stone,random.uniform(-.012,.012),.022)
for x in [-7.5,7]:
 box('Drain channel',(x,0,.04),(.26,13,.05),dark)
 for i in range(65):box('Drain grate',(x,-6.4+i*.2,.075),(.3,.045,.025),metal,bevel=0)
# Walls: complete rear and left, cutaway foreground.
for level in range(12):
 for col in range(24):
  x=-8.65+col*.75+(level%2)*.375
  if x>8.8 or (-3<x<-1.2 and level<8):continue
  if level>9 and random.random()<.23:continue
  box('Rear masonry',(x,6.65,.25+level*.39),(.72,.66,.36),stone,bevel=.035)
 for col in range(19):
  y=-6.6+col*.73+(level%2)*.36
  if level>8 and random.random()<.18:continue
  box('West masonry',(-8.7,y,.25+level*.39),(.65,.70,.36),stone,bevel=.035)
for x in [-8.65,-5.1,-1.05,3.5,8.5]:
 box('Wall buttress',(x,6.4,2.6),(.5,.85,5.2),metal)
 box('Buttress cap',(x,6.4,5.22),(.78,1,.2),stone)
for y in [-5,-1,3,6]:
 box('West pier',(-8.35,y,2.5),(.75,.6,5),metal)
 cylinder('Vertical utility pipe',(-8,y,.2),(-8,y,4.7),.06,rust)
for i in range(22):
 box('Foreground broken curb',(-8.4+i*.78,-7,.25),(.74,.55,random.uniform(.3,.7)),stone)
for j in range(11):box('East cutaway curb',(8.6,-6.4+j*.7,.6+j*.10),(.7,.66,.9+j*.15),stone)
# Rear gate.
box('Gate frame',(-2.05,6.62,1.6),(2.2,.45,3.25),dark)
for x in [-2.57,-1.53]:
 box('Gate door',(x,6.33,1.6),(.94,.16,3.05),metal)
 for z in [.5,1.55,2.65]:box('Gate raised panels',(x,6.19,z),(.69,.08,.49),metal)
for x in [-3.04,-1.06]:box('Gate luminous strips',(x,6.07,1.8),(.055,.055,2.1),cyan)
for x in [-2.7,-2.1,-1.5]:box('Gate header signal',(x,6.18,3.05),(.39,.08,.055),cyan)
# Repair shop, opening towards camera (south).
box('Workshop shell',(3.6,5.48,1.5),(5.8,2.1,3),metal)
box('Workshop lower sill',(3.6,4.29,.35),(6,.23,.26),rust)
box('Workshop lintel',(3.6,4.24,2.65),(6,.23,.28),wood)
for x in [.7,2.65,4.8,6.5]:box('Shop posts',(x,4.18,1.45),(.15,.18,2.75),rust)
for x in [1.7,5.6]:
 box('Shop recessed window',(x,4.31,1.6),(1.35,.06,1.16),dark)
 for xx in [x-.44,x,x+.44]:box('Window mullion',(xx,4.19,1.6),(.045,.08,1.12),brass)
 box('Workbench shelf',(x,3.98,.85),(1.5,.58,.12),wood)
box('Shop service door',(3.6,4.28,1.25),(1.25,.08,2.35),wood)
box('Workshop sign backing',(3.6,4.07,2.63),(2.1,.12,.38),dark)
box('Workshop sign light',(3.6,3.99,2.63),(1.7,.025,.12),amber)
for i in range(12):
 roof=box('Standing seam awning',(.57+i*.54,4.9,3.02),(.55,3.05,.12),rust,bevel=.015);roof.rotation_euler.x=math.radians(12)
 box('Roof seam',(.57+i*.54,4.9,3.07),(.035,3.02,.1),metal).rotation_euler.x=math.radians(12)
box('Workshop upper roof',(3.6,5.68,3.72),(6.2,1.75,.2),metal)
for x in [1,2,3,4,5,6]:box('Upper roof rib',(x,5.68,3.86),(.065,1.7,.06),brass)
def lamp(x,y,z):
 box('Lantern mount',(x,y+.08,z),(.4,.18,.54),dark)
 box('Lantern glass',(x,y-.08,z),(.24,.2,.36),amber)
 for xx in [x-.14,x+.14]:box('Lantern cage',(xx,y-.2,z),(.025,.03,.45),brass)
 data=bpy.data.lights.new('Warm shop pool','POINT');data.energy=65;data.color=(1,.52,.2);data.shadow_soft_size=.4
 o=bpy.data.objects.new('Warm shop pool',data);scene.collection.objects.link(o);o.location=(x,y-.5,z)
for x in [1,3,6.2]:lamp(x,3.96,1.93)
# Skyline behind the playable court.
for x,w,h in [(-7,4,6),(-2.5,4,7.1),(2.5,4.1,6.4),(7,3.2,7.8)]:
 box('Background tenement',(x,8.8,h/2-.2),(w,2.8,h),metal)
 box('Tenement cornice',(x,8.6,h-.1),(w+.35,3,.23),stone)
 box('Roof ventilation',(x,8.7,h+.45),(1.6,1.2,.9),dark)
 for xx in range(4):box('Facade rib',(x-w/2+.4+xx*w/4,7.3,h/2),(.12,.15,h-.5),rust)
# Utility pipes and east pergola.
for z in [3.8,4.06]:cylinder('Rear service main',(-8,6.02,z),(7.9,6.02,z),.065,rust)
for x,y in [(7.4,-3.8),(7.4,.9),(8.5,-3.8),(8.5,.9)]:box('Pergola upright',(x,y,1.6),(.16,.16,3.2),metal)
for y in [-3.8,.9]:box('Pergola beam',(8,y,3.24),(2,.16,.22),metal)
for j in range(17):box('Pergola slat',(8,-3.8+j*.3,3.43),(2,.13,.1),wood)
# Crates, detailed separate slats and straps.
def crate(x,y,z=0,s=1):
 box('Cargo box',(x,y,z+s*.45),(s*.92,s*.86,s*.86),wood,random.uniform(-.05,.05))
 for zz in [.12,.4,.7]:box('Crate plank',(x,y-s*.455,z+s*zz),(s,.06*s,.23*s),wood)
 for xx in [-.34,.34]:
  box('Cargo strap',(x+s*xx,y-s*.49,z+s*.43),(.06*s,.05*s,.91*s),metal)
  box('Cargo lid strap',(x+s*xx,y,z+s*.89),(.06*s,.9*s,.04*s),metal)
for x,y,s in [(-6,-3,1.25),(-5.1,-3.15,.9),(-6,2,1),(-.1,4,.9),(6.1,-5.6,1.1),(5.25,-5.8,.75)]:crate(x,y,0,s)
crate(-6,-3,1.15,.78);crate(-.1,4,.83,.63)
# Small salvage robots and caretaker.
def robot(x,y,scale,body):
 s=scale
 for dx in [-.27,.27]:
  box('Robot boot',(x+dx*s,y-.02,.18*s),(.3*s,.48*s,.22*s),dark)
  cylinder('Robot leg',(x+dx*s,y,.2*s),(x+dx*s,y,.48*s),.07*s,brass)
 box('Robot chassis',(x,y,.73*s),(.76*s,.58*s,.56*s),body,bevel=.065)
 box('Robot head',(x,y-.01,1.19*s),(.66*s,.53*s,.37*s),body,bevel=.065)
 box('Robot face',(x,y-.29*s,1.2*s),(.5*s,.04*s,.2*s),dark)
 for dx in [-.14,.14]:box('Robot optic',(x+dx*s,y-.32*s,1.23*s),(.09*s,.035*s,.075*s),cyan)
 for dx in [-.5,.5]:
  cylinder('Robot shoulder',(x+dx*.7*s,y,.88*s),(x+dx*s,y,.65*s),.07*s,brass)
  box('Robot claw',(x+dx*s,y-.04,.53*s),(.16*s,.22*s,.2*s),body)
 cylinder('Robot aerial',(x+.2*s,y,1.38*s),(x+.2*s,y,1.65*s),.023*s,brass)
 box('Aerial light',(x+.2*s,y,1.66*s),(.09*s,.08*s,.08*s),amber)
robot(2.7,-2.45,1,ivory);robot(6,-2,1.13,metal);robot(-3.8,3.25,.8,brass)
for x in [1.35,1.65]:
 box('Caretaker boot',(x,-2.1,.14),(.22,.43,.23),dark)
 cylinder('Caretaker trouser',(x,-2,.28),(x,-2,.92),.115,dark)
box('Caretaker coat',(1.5,-2,1.15),(.55,.34,.7),orange)
box('Caretaker backpack',(1.5,-1.73,1.21),(.46,.22,.53),metal)
box('Caretaker hood',(1.5,-2,1.72),(.38,.36,.4),orange,bevel=.07)
box('Caretaker visor',(1.5,-2.19,1.74),(.29,.04,.17),dark)
for x in [1.12,1.88]:cylinder('Caretaker arm',(x,-2,1.4),(x,-2.1,.9),.10,orange)
# Hand-authored puddle polygons: thin triangulated patches with proper planar UV.
for k,(x,y,rx,ry) in enumerate([(-3,-2,1.8,.8),(3,2.3,2.5,.48),(5,-3.7,1.35,.55),(-2.2,4.8,1.5,.6),(.3,-5,1.9,.6)]):
 vertices=[(x,y,.079)]+[(x+math.cos(i*math.tau/18)*rx*random.uniform(.83,1),y+math.sin(i*math.tau/18)*ry*random.uniform(.8,1),.079) for i in range(18)]
 mesh=bpy.data.meshes.new('Puddle');mesh.from_pydata(vertices,[],[(0,i+1,(i+1)%18+1) for i in range(18)]);mesh.materials.append(materials[water][0]);uv=mesh.uv_layers.new(name='UVMap')
 for p in mesh.polygons:
  for li in p.loop_indices:
   v=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=((v.x-x)/rx*.45+.5,(v.y-y)/ry*.45+.5)
 o=bpy.data.objects.new('Rain puddle',mesh);scene.collection.objects.link(o)
# Ivy stems plus individual low-poly foliage; clustered along wall edges.
for x in [-7.4,-5.7,-.65,6.9,8.0]:
 for vine in range(3):
  xx=x+vine*.17;length=random.uniform(1,3.4)
  cylinder('Ivy stem',(xx,6.04,4.9),(xx+.22,5.97,4.9-length),.018,wood,6)
  for j in range(int(length*11)):
   z=4.9-j*.09;y=5.91+random.uniform(-.08,.06)
   o=box('Ivy leaf',(xx+random.uniform(-.22,.3),y,z),(.13,.065,.17),random.choice([leaf,leaf2]),random.uniform(-1,1),.018)
   o.rotation_euler.y=random.uniform(-.8,.8)
for i in range(100):
 x=random.choice([random.uniform(-8.2,-7.7),random.uniform(7.7,8.4)]);y=random.uniform(-6.5,5.7)
 box('Edge rubble',(x,y,.13),(random.uniform(.08,.23),random.uniform(.08,.25),random.uniform(.07,.2)),stone,random.random()*3)
 if i%2==0:box('Ground moss',(x+.15,y,.1),(.23,.19,.045),leaf,random.random()*3)

# Apply geometry modifiers and merge by material for efficient engine draw calls.
print('GEOMETRY_READY',flush=True)
meshes=[o for o in scene.objects if o.type=='MESH']
module_count=len(meshes)
for o in meshes:
 for mod in list(o.modifiers):o.modifiers.remove(mod)
for key,(mat,q) in materials.items():
 group=[o for o in scene.objects if o.type=='MESH' and len(o.data.materials) and o.data.materials[0]==mat]
 if not group:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();group[0].name=key
 mod=group[0].modifiers.new('Module edge bevel','BEVEL');mod.width=.018;mod.segments=1
 bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=group[0].modifiers.new('Weighted normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
 print('MERGED',key,flush=True)
 group[0]['UV_policy']='Nonoverlapping face islands per module. Intentional atlas reuse across repeated modules.'

world=bpy.data.worlds.new('Overcast evening');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.27,.34,.38,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
def area(name,loc,energy,color,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Late sun',(-8,-3,14),2200,(1,.8,.51),8);area('Cool sky',(5,3,12),1500,(.47,.66,.77),10)
d=bpy.data.lights.new('Sun','SUN');d.energy=1.6;d.color=(1,.83,.62);d.angle=.2
o=bpy.data.objects.new('Sun',d);scene.collection.objects.link(o);o.rotation_euler=(.5,-.5,-.45)
bpy.ops.object.camera_add(location=(21,-28,23));camera=bpy.context.object;camera.rotation_euler=(Vector((0,1,1.5))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=32;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'

# UV layout documentation: actual post-bevel UV edges from all meshes, grouped by material.
uvdir=OUT/'uv';uvdir.mkdir(exist_ok=True)
report={'seed':42,'moduleCount':module_count,'meshes':[],'atlas':'surface-atlas.png','uvPolicy':'Module faces are nonoverlapping with margins; repeated modules intentionally reuse the same atlas area. UV dimensions are proportional per module, not a unique scene-wide lightmap.'}
for o in [o for o in scene.objects if o.type=='MESH']:
 uv=o.data.uv_layers.active;bad=0;segments=[]
 for p in o.data.polygons:
  coords=[uv.data[i].uv[:] for i in p.loop_indices]
  for u,v in coords:
   if not (0<=u<=1 and 0<=v<=1):bad+=1
  for a,b in zip(coords,coords[1:]+coords[:1]):segments.append(f'M {a[0]*1024:.2f} {(1-a[1])*1024:.2f} L {b[0]*1024:.2f} {(1-b[1])*1024:.2f}')
 name=o.name.split(' |')[0].replace(' ','-').lower()
 (uvdir/(name+'.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#152022"/><path d="'+' '.join(sorted(set(segments)))+'" stroke="#dfca82" stroke-width=".7" fill="none"/></svg>')
 report['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'uvOutOfBounds':bad})
(OUT/'validation.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'rain-court.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type=='MESH':o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'rain-court.glb'),export_format='GLB',use_selection=True,export_apply=True)
bpy.ops.export_scene.fbx(filepath=str(OUT/'rain-court.fbx'),use_selection=True,object_types={'MESH'},apply_unit_scale=True,axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True)
scene.render.filepath=str(OUT/'preview.png');bpy.ops.render.render(write_still=True)
# Checker render is a genuine scene render with UV-based checker material.
checker=bpy.data.materials.new('UV inspection checker');checker.use_nodes=True
nodes=checker.node_tree.nodes;tex=nodes.new('ShaderNodeTexChecker');tex.inputs['Scale'].default_value=48
coord=nodes.new('ShaderNodeTexCoord');checker.node_tree.links.new(coord.outputs['UV'],tex.inputs['Vector']);checker.node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
scene.view_layers[0].material_override=checker;scene.cycles.samples=8;scene.render.resolution_percentage=65;scene.render.filepath=str(OUT/'uv-checker.png');bpy.ops.render.render(write_still=True)
print('BUILD_COMPLETE',json.dumps(report))
